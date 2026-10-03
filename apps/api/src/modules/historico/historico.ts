import type { Prisma, TipoHistorico } from '@prisma/client';
import { formatarDataBr, ROTULO_STATUS_DEMANDA, type StatusDemanda } from '@stante/shared';
import { prisma } from '../../db';

/** Funciona dentro de uma transação ($transaction) ou com o cliente normal. */
type Cliente = Prisma.TransactionClient;

export interface EventoHistorico {
  tipo: TipoHistorico;
  dados?: Prisma.InputJsonObject;
}

/**
 * Grava os eventos. Deve ser chamado na MESMA transação da alteração que ele
 * descreve: assim nunca existe uma mudança sem registro, nem registro de uma
 * mudança que não aconteceu.
 */
export async function registrar(
  cliente: Cliente,
  demandaId: number,
  autorId: number,
  eventos: EventoHistorico[],
): Promise<void> {
  if (eventos.length === 0) return;
  await cliente.historicoDemanda.createMany({
    data: eventos.map((evento) => ({
      demandaId,
      autorId,
      tipo: evento.tipo,
      dados: evento.dados ?? {},
    })),
  });
}

type Dados = Record<string, unknown>;

const rotuloStatus = (valor: unknown) => ROTULO_STATUS_DEMANDA[valor as StatusDemanda] ?? String(valor);
const texto = (valor: unknown) => (typeof valor === 'string' ? valor : '');

/** O texto é montado na hora de ler, a partir dos dados guardados: dá para melhorar a redação depois. */
export function descrever(tipo: TipoHistorico, dados: Dados): string {
  switch (tipo) {
    case 'criada':
      return dados.origem === 'campo'
        ? 'Demanda aberta em campo (aguardando validação do gestor)'
        : 'Demanda criada';
    case 'validada':
      return 'Demanda validada pelo gestor';
    case 'status_alterado':
      return `Status alterado de ${rotuloStatus(dados.de)} para ${rotuloStatus(dados.para)}`;
    case 'reaberta':
      return `Demanda reaberta (${rotuloStatus(dados.para)}). Motivo: ${texto(dados.motivo)}`;
    case 'fiscal_alterado': {
      const de = dados.de ? texto(dados.de) : null;
      const para = dados.para ? texto(dados.para) : null;
      if (!de && para) return `Fiscal atribuído: ${para}`;
      if (de && !para) return `Fiscal removido (era ${de})`;
      return `Fiscal alterado de ${de} para ${para}`;
    }
    case 'prazo_alterado':
      return `Prazo alterado de ${formatarDataBr(texto(dados.de))} para ${formatarDataBr(texto(dados.para))}`;
    case 'assunto_alterado':
      return 'Assunto alterado';
    case 'anexo_adicionado':
      return `Anexo adicionado: ${texto(dados.nome)}`;
    case 'anexo_removido':
      return `Anexo removido: ${texto(dados.nome)}`;
  }
}

/** Do mais recente para o mais antigo. */
export async function listarHistorico(demandaId: number) {
  const itens = await prisma.historicoDemanda.findMany({
    where: { demandaId },
    // Eventos da mesma operação têm o mesmo instante (a transação); o id desempata na ordem em que foram gravados
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { autor: { select: { nome: true } } },
  });

  return itens.map((item) => ({
    id: item.id,
    tipo: item.tipo,
    descricao: descrever(item.tipo, item.dados as Dados),
    autor: item.autor?.nome ?? null,
    criadoEm: item.createdAt.toISOString(),
  }));
}
