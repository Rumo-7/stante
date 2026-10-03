import { randomUUID } from 'node:crypto';
import type { Prisma, TipoNotificacao } from '@prisma/client';
import {
  adicionarDias,
  DIAS_PRAZO_CRITICO,
  diasParaPrazo,
  formatarDataBr,
  hojeNoFuso,
  numeroDemanda,
} from '@stante/shared';
import { prisma } from '../../db';
import { env } from '../../env';
import { paraData } from '../demandas/filtros';

type Cliente = Prisma.TransactionClient;

/** Prazos vencidos há mais que isso não geram aviso novo (o dashboard já os destaca). */
const JANELA_VENCIDAS_DIAS = 30;
/** Avisos já lidos são apagados depois deste tempo. */
const GUARDAR_LIDAS_DIAS = 60;
const INTERVALO_ALERTAS_MS = 30 * 60 * 1000;

interface DemandaResumo {
  id: number;
  assunto: string;
}

interface NovaNotificacao {
  userId: number;
  demandaId: number;
  tipo: TipoNotificacao;
  chave: string;
  mensagem: string;
}

const cortar = (texto: string, limite = 80) => (texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto);
const rotulo = (demanda: DemandaResumo) => `${numeroDemanda(demanda.id)} · ${cortar(demanda.assunto)}`;

/** Grava os avisos; os repetidos (mesma chave) são ignorados em silêncio. */
async function gravar(cliente: Cliente, itens: NovaNotificacao[]): Promise<number> {
  if (itens.length === 0) return 0;
  const resultado = await cliente.notificacao.createMany({ data: itens, skipDuplicates: true });
  return resultado.count;
}

async function idsDosGestores(cliente: Cliente): Promise<number[]> {
  const gestores = await cliente.user.findMany({
    where: { perfil: 'gestor', status: 'ativo' },
    select: { id: true },
  });
  return gestores.map((gestor) => gestor.id);
}

async function usuarioDoFiscal(cliente: Cliente, fiscalId: number | null): Promise<number | null> {
  if (!fiscalId) return null;
  const fiscal = await cliente.fiscal.findUnique({ where: { id: fiscalId }, select: { userId: true } });
  return fiscal?.userId ?? null;
}

/** Remove duplicados e quem fez a ação: ninguém é avisado do que ele mesmo fez. */
function destinatarios(candidatos: (number | null | undefined)[], autorId: number): number[] {
  return [...new Set(candidatos.filter((id): id is number => typeof id === 'number' && id !== autorId))];
}

// ---- Avisos por evento (chamados dentro da transação da ação que os causa) ----

export async function notificarAbertaEmCampo(cliente: Cliente, demanda: DemandaResumo, autor: { id: number; nome: string }) {
  const gestores = destinatarios(await idsDosGestores(cliente), autor.id);
  await gravar(
    cliente,
    gestores.map((userId) => ({
      userId,
      demandaId: demanda.id,
      tipo: 'aguardando_validacao' as const,
      chave: String(demanda.id),
      mensagem: `${rotulo(demanda)} — aberta em campo por ${autor.nome}, aguarda validação`,
    })),
  );
}

export async function notificarValidada(
  cliente: Cliente,
  demanda: DemandaResumo & { fiscalId: number | null; criadaPorId: number | null },
  gestorId: number,
) {
  const fiscalUserId = await usuarioDoFiscal(cliente, demanda.fiscalId);
  await gravar(
    cliente,
    destinatarios([demanda.criadaPorId, fiscalUserId], gestorId).map((userId) => ({
      userId,
      demandaId: demanda.id,
      tipo: 'demanda_validada' as const,
      chave: String(demanda.id),
      mensagem: `${rotulo(demanda)} — validada pelo gestor`,
    })),
  );
}

export async function notificarAtribuida(cliente: Cliente, demanda: DemandaResumo, fiscalId: number, autorId: number) {
  const fiscalUserId = await usuarioDoFiscal(cliente, fiscalId);
  await gravar(
    cliente,
    destinatarios([fiscalUserId], autorId).map((userId) => ({
      userId,
      demandaId: demanda.id,
      tipo: 'demanda_atribuida' as const,
      // Atribuições repetidas ao mesmo fiscal (A → B → A) são avisos legítimos: cada uma é única
      chave: randomUUID(),
      mensagem: `${rotulo(demanda)} — atribuída a você`,
    })),
  );
}

export async function notificarReaberta(
  cliente: Cliente,
  demanda: DemandaResumo & { fiscalId: number | null },
  motivo: string,
  autorId: number,
) {
  const fiscalUserId = await usuarioDoFiscal(cliente, demanda.fiscalId);
  await gravar(
    cliente,
    destinatarios([fiscalUserId], autorId).map((userId) => ({
      userId,
      demandaId: demanda.id,
      tipo: 'demanda_reaberta' as const,
      chave: randomUUID(),
      mensagem: `${rotulo(demanda)} — reaberta. Motivo: ${cortar(motivo, 120)}`,
    })),
  );
}

// ---- Avisos de prazo (rotina periódica) ----

/**
 * Cria os avisos de prazo que ainda não existem. Pode rodar quantas vezes quiser:
 * cada (pessoa, demanda, tipo, prazo) gera um aviso só. Devolve quantos criou.
 */
export async function gerarAlertasDePrazo(hoje: string = hojeNoFuso(env.TZ_NEGOCIO)): Promise<number> {
  const demandas = await prisma.demanda.findMany({
    where: {
      status: { in: ['aberta', 'em_andamento'] },
      prazo: {
        gte: paraData(adicionarDias(hoje, -JANELA_VENCIDAS_DIAS)),
        lte: paraData(adicionarDias(hoje, DIAS_PRAZO_CRITICO)),
      },
    },
    include: { fiscal: { select: { userId: true } } },
  });

  const gestores = await idsDosGestores(prisma);
  const itens: NovaNotificacao[] = [];

  for (const demanda of demandas) {
    const prazo = demanda.prazo.toISOString().slice(0, 10);
    const dias = diasParaPrazo(prazo, hoje);
    const fiscalUserId = demanda.fiscal?.userId ?? null;

    if (dias < 0) {
      const atraso = -dias;
      const mensagem = `${rotulo(demanda)} — venceu em ${formatarDataBr(prazo)} (há ${atraso} dia${atraso === 1 ? '' : 's'})`;
      // O fiscal e todos os gestores
      for (const userId of new Set([fiscalUserId, ...gestores])) {
        if (userId !== null) itens.push({ userId, demandaId: demanda.id, tipo: 'prazo_vencido', chave: prazo, mensagem });
      }
    } else if (fiscalUserId !== null) {
      // Prazo crítico: só o fiscal (os gestores veem o alerta no dashboard)
      const quando = dias === 0 ? 'vence hoje' : `vence em ${dias} dia${dias === 1 ? '' : 's'} (${formatarDataBr(prazo)})`;
      itens.push({
        userId: fiscalUserId,
        demandaId: demanda.id,
        tipo: 'prazo_critico',
        chave: prazo,
        mensagem: `${rotulo(demanda)} — ${quando}`,
      });
    }
  }

  const criados = await gravar(prisma, itens);

  // Faxina: avisos já lidos e antigos não precisam ficar para sempre
  await prisma.notificacao.deleteMany({
    where: { lidaEm: { not: null, lt: new Date(Date.now() - GUARDAR_LIDAS_DIAS * 24 * 60 * 60 * 1000) } },
  });

  return criados;
}

/** Roda a geração ao subir o servidor e depois a cada 30 minutos. */
export function iniciarAlertasDePrazo(): void {
  const rodar = async () => {
    try {
      const criados = await gerarAlertasDePrazo();
      if (criados > 0) console.log(`Alertas de prazo gerados: ${criados}`);
    } catch (erro) {
      console.error('Falha ao gerar alertas de prazo:', erro);
    }
  };
  void rodar();
  setInterval(rodar, INTERVALO_ALERTAS_MS).unref();
}
