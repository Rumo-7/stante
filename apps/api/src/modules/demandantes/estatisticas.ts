import { diasParaPrazo, hojeNoFuso, inicioDoDia, adicionarDias } from '@stante/shared';
import type { StatusDemanda, TipoDemandante } from '@prisma/client';
import { prisma } from '../../db';
import { env } from '../../env';
import { filtroPeriodoDeCadastro } from '../demandas/filtros';

const DIA_MS = 24 * 60 * 60 * 1000;

export interface OrgaoBase {
  id: number;
  nome: string;
  tipo: TipoDemandante;
}

export interface DemandaBase {
  demandanteId: number;
  status: StatusDemanda;
  prazo: Date;
  createdAt: Date;
  concluidaEm: Date | null;
}

export interface EstatisticasOrgao extends OrgaoBase {
  recebidas: number;
  concluidas: number;
  /** Concluídas até o fim do dia do prazo. */
  noPrazo: number;
  /** Concluídas depois do prazo. */
  foraDoPrazo: number;
  /** Abertas ou em andamento (inclui as vencidas). */
  emAberto: number;
  /** Abertas ou em andamento com o prazo já passado. */
  vencidas: number;
  /** concluídas / recebidas. Null se não recebeu nada. */
  taxaConclusao: number | null;
  /** no prazo / (no prazo + fora do prazo + vencidas): a vencida sem resposta conta contra. */
  pontualidade: number | null;
  /** Mediana de dias entre o cadastro e a conclusão. */
  medianaDias: number | null;
  /** Mediana de dias que o órgão deu de prazo (prazo menos o dia do cadastro). */
  prazoConcedidoMedianoDias: number | null;
}

export interface ResumoEstatisticas {
  orgaosComDemandas: number;
  recebidas: number;
  concluidas: number;
  taxaConclusao: number | null;
  pontualidade: number | null;
  medianaDias: number | null;
}

const arredondar = (valor: number, casas = 1) => Math.round(valor * 10 ** casas) / 10 ** casas;

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  const valor = ordenados.length % 2 === 1 ? ordenados[meio]! : (ordenados[meio - 1]! + ordenados[meio]!) / 2;
  return arredondar(valor);
}

const razao = (parte: number, total: number) => (total === 0 ? null : arredondar(parte / total, 3));

interface Acumulador {
  recebidas: number;
  concluidas: number;
  noPrazo: number;
  foraDoPrazo: number;
  emAberto: number;
  vencidas: number;
  duracoes: number[];
  prazosConcedidos: number[];
}

const novoAcumulador = (): Acumulador => ({
  recebidas: 0,
  concluidas: 0,
  noPrazo: 0,
  foraDoPrazo: 0,
  emAberto: 0,
  vencidas: 0,
  duracoes: [],
  prazosConcedidos: [],
});

/**
 * Calcula os indicadores por órgão a partir das demandas (já filtradas pelo período de cadastro).
 * A conta é por "coorte": as demandas recebidas no período, com a situação delas hoje.
 */
export function agregarPorOrgao(
  orgaos: OrgaoBase[],
  demandas: DemandaBase[],
  hoje: string,
  fuso: string,
): { orgaos: EstatisticasOrgao[]; resumo: ResumoEstatisticas } {
  const porOrgao = new Map<number, Acumulador>(orgaos.map((orgao) => [orgao.id, novoAcumulador()]));
  const geral = novoAcumulador();

  for (const demanda of demandas) {
    const acumuladores = [porOrgao.get(demanda.demandanteId), geral];
    const prazo = demanda.prazo.toISOString().slice(0, 10);
    const diaDoCadastro = hojeNoFuso(fuso, demanda.createdAt);
    // Prazos no passado (cadastro retroativo) não dizem nada sobre o quanto o órgão costuma dar
    const concedido = diasParaPrazo(prazo, diaDoCadastro);

    for (const acc of acumuladores) {
      if (!acc) continue;
      acc.recebidas += 1;
      if (concedido >= 0) acc.prazosConcedidos.push(concedido);

      if (demanda.status === 'concluida') {
        acc.concluidas += 1;
        if (demanda.concluidaEm) {
          // "No prazo" = concluída até o fim do dia do prazo, contado no fuso do negócio
          const limite = inicioDoDia(adicionarDias(prazo, 1), fuso);
          if (demanda.concluidaEm < limite) acc.noPrazo += 1;
          else acc.foraDoPrazo += 1;
          acc.duracoes.push((demanda.concluidaEm.getTime() - demanda.createdAt.getTime()) / DIA_MS);
        }
      } else {
        acc.emAberto += 1;
        if (diasParaPrazo(prazo, hoje) < 0) acc.vencidas += 1;
      }
    }
  }

  const indicadores = (acc: Acumulador) => ({
    taxaConclusao: razao(acc.concluidas, acc.recebidas),
    pontualidade: razao(acc.noPrazo, acc.noPrazo + acc.foraDoPrazo + acc.vencidas),
    medianaDias: mediana(acc.duracoes),
  });

  const resultado = orgaos
    .map((orgao): EstatisticasOrgao => {
      const acc = porOrgao.get(orgao.id)!;
      return {
        ...orgao,
        recebidas: acc.recebidas,
        concluidas: acc.concluidas,
        noPrazo: acc.noPrazo,
        foraDoPrazo: acc.foraDoPrazo,
        emAberto: acc.emAberto,
        vencidas: acc.vencidas,
        ...indicadores(acc),
        prazoConcedidoMedianoDias: mediana(acc.prazosConcedidos),
      };
    })
    // Mais demandas primeiro; empate pelo nome
    .sort((a, b) => b.recebidas - a.recebidas || a.nome.localeCompare(b.nome, 'pt-BR'));

  return {
    orgaos: resultado,
    resumo: {
      orgaosComDemandas: resultado.filter((orgao) => orgao.recebidas > 0).length,
      recebidas: geral.recebidas,
      concluidas: geral.concluidas,
      ...indicadores(geral),
    },
  };
}

/** Lê do banco as demandas do período e calcula. Demandas em análise ainda não são trabalho formal e ficam de fora. */
export async function estatisticasPorOrgao(periodo: { de?: string; ate?: string }) {
  const [orgaos, demandas] = await Promise.all([
    prisma.demandante.findMany({ select: { id: true, nome: true, tipo: true } }),
    prisma.demanda.findMany({
      where: { AND: [{ status: { not: 'em_analise' } }, ...filtroPeriodoDeCadastro(periodo.de, periodo.ate)] },
      select: { demandanteId: true, status: true, prazo: true, createdAt: true, concluidaEm: true },
    }),
  ]);

  return agregarPorOrgao(orgaos, demandas, hojeNoFuso(env.TZ_NEGOCIO), env.TZ_NEGOCIO);
}
