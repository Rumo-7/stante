import { hojeNoFuso } from '@stante/shared';
import type { UsuarioLogado } from '../../auth/sessao';
import { prisma } from '../../db';
import { env } from '../../env';
import { escopoDemandas } from '../demandas/escopo';
import { paraData } from '../demandas/filtros';
import { mediana } from '../demandantes/estatisticas';
import { avaliarRisco, type ContextoDeRisco, type NivelDeRisco, type Ritmo } from './risco';

const DIA_MS = 24 * 60 * 60 * 1000;
/** Só o último ano conta: o ritmo da unidade de três anos atrás não diz nada sobre hoje. */
const JANELA_DO_HISTORICO_DIAS = 365;
const LIMITE_DA_LISTA = 50;
const EM_ANDAMENTO = ['aberta', 'em_andamento'] as const;

export interface ItemDoRadar {
  demandaId: number;
  numero: string;
  assunto: string;
  demandante: string;
  fiscal: string | null;
  prazo: string;
  diasRestantes: number;
  nivel: NivelDeRisco;
  motivos: string[];
}

export interface ResultadoDoRadar {
  itens: ItemDoRadar[];
  /** Quantos há de cada nível, mesmo que a lista tenha sido cortada. */
  totais: { alto: number; medio: number };
}

function ritmoDe(duracoes: number[]): Ritmo | null {
  const medianaDias = mediana(duracoes);
  return medianaDias === null ? null : { medianaDias, amostra: duracoes.length };
}

/**
 * Lê o histórico e a carga da equipe (da unidade toda, qualquer que seja o perfil de quem pergunta:
 * são números agregados) e avalia as demandas que a pessoa pode ver.
 */
export async function calcularRadar(
  usuario: UsuarioLogado,
  hoje: string = hojeNoFuso(env.TZ_NEGOCIO),
): Promise<ResultadoDoRadar> {
  const fuso = env.TZ_NEGOCIO;
  const desde = new Date(Date.now() - JANELA_DO_HISTORICO_DIAS * DIA_MS);

  const [historico, cargas, fiscais, candidatas] = await Promise.all([
    prisma.demanda.findMany({
      where: { status: 'concluida', concluidaEm: { not: null, gte: desde } },
      select: { demandanteId: true, createdAt: true, concluidaEm: true },
    }),
    prisma.demanda.groupBy({
      by: ['fiscalId'],
      where: { status: { in: [...EM_ANDAMENTO] }, fiscalId: { not: null } },
      _count: { _all: true },
    }),
    prisma.fiscal.findMany({
      where: { OR: [{ userId: null }, { user: { status: { not: 'bloqueado' } } }] },
      select: { id: true },
    }),
    prisma.demanda.findMany({
      where: {
        AND: [escopoDemandas(usuario), { status: { in: [...EM_ANDAMENTO] } }, { prazo: { gte: paraData(hoje) } }],
      },
      include: { demandante: { select: { nome: true } }, fiscal: { select: { nome: true } } },
    }),
  ]);

  const duracoesDoOrgao = new Map<number, number[]>();
  const duracoes: number[] = [];
  for (const demanda of historico) {
    if (!demanda.concluidaEm) continue;
    const duracao = (demanda.concluidaEm.getTime() - demanda.createdAt.getTime()) / DIA_MS;
    duracoes.push(duracao);
    duracoesDoOrgao.set(demanda.demandanteId, [...(duracoesDoOrgao.get(demanda.demandanteId) ?? []), duracao]);
  }
  const ritmoDoOrgao = new Map<number, Ritmo>();
  for (const [orgaoId, lista] of duracoesDoOrgao) {
    const ritmo = ritmoDe(lista);
    if (ritmo) ritmoDoOrgao.set(orgaoId, ritmo);
  }

  const cargaDoFiscal = new Map(cargas.map((c) => [c.fiscalId!, c._count._all]));
  const cargaTipicaDaEquipe = mediana(fiscais.map((f) => cargaDoFiscal.get(f.id) ?? 0));
  const nomes = new Map(candidatas.map((d) => [d.demandanteId, d.demandante.nome]));

  const contexto: ContextoDeRisco = {
    hoje,
    nomeDoOrgao: (id) => nomes.get(id) ?? 'Órgão',
    ritmoDoOrgao,
    ritmoGeral: ritmoDe(duracoes),
    cargaDoFiscal,
    cargaTipicaDaEquipe,
  };

  const itens: ItemDoRadar[] = [];
  for (const demanda of candidatas) {
    const prazo = demanda.prazo.toISOString().slice(0, 10);
    const risco = avaliarRisco(
      {
        id: demanda.id,
        demandanteId: demanda.demandanteId,
        fiscalId: demanda.fiscalId,
        status: demanda.status as 'aberta' | 'em_andamento',
        prazo,
        cadastro: hojeNoFuso(fuso, demanda.createdAt),
      },
      contexto,
    );
    if (!risco) continue;
    itens.push({
      demandaId: demanda.id,
      numero: `DEM-${String(demanda.id).padStart(4, '0')}`,
      assunto: demanda.assunto,
      demandante: demanda.demandante.nome,
      fiscal: demanda.fiscal?.nome ?? null,
      prazo,
      diasRestantes: Math.round((demanda.prazo.getTime() - paraData(hoje).getTime()) / DIA_MS),
      nivel: risco.nivel,
      motivos: risco.motivos,
    });
  }

  // Mais arriscadas primeiro; entre as de mesmo nível, as que vencem antes
  itens.sort(
    (a, b) =>
      Number(b.nivel === 'alto') - Number(a.nivel === 'alto') || a.diasRestantes - b.diasRestantes || a.demandaId - b.demandaId,
  );

  return {
    itens: itens.slice(0, LIMITE_DA_LISTA),
    totais: {
      alto: itens.filter((i) => i.nivel === 'alto').length,
      medio: itens.filter((i) => i.nivel === 'medio').length,
    },
  };
}
