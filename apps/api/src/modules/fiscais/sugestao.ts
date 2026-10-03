import { adicionarDias, DIAS_PRAZO_CRITICO, hojeNoFuso } from '@stante/shared';
import { prisma } from '../../db';
import { env } from '../../env';
import { paraData } from '../demandas/filtros';

export interface SugestaoFiscal {
  fiscalId: number;
  nome: string;
  especialidade: string | null;
  /** Demandas formais em andamento (abertas ou em andamento) hoje. */
  ativas: number;
  /** Dessas, as que estão com prazo crítico ou já vencidas. */
  emRisco: number;
  /** Quantas demandas deste mesmo órgão o fiscal já teve (qualquer situação). */
  atendimentosDoOrgao: number;
  /** Menor é melhor. */
  pontos: number;
  sugerido: boolean;
  resumo: string;
}

// Cada demanda ativa pesa 2; estar com prazo crítico/vencido pesa 3 a mais; ter atendido o órgão
// antes tira 1, o que só desempata entre cargas iguais (uma demanda a mais pesa mais que isso).
const PESO_ATIVA = 2;
const PESO_EM_RISCO = 3;
const BONUS_JA_ATENDEU_O_ORGAO = 1;

export function calcularPontos(ativas: number, emRisco: number, atendimentosDoOrgao: number): number {
  return (
    ativas * PESO_ATIVA +
    emRisco * PESO_EM_RISCO -
    (atendimentosDoOrgao > 0 ? BONUS_JA_ATENDEU_O_ORGAO : 0)
  );
}

export function resumir(ativas: number, emRisco: number, atendimentosDoOrgao: number): string {
  const partes = [ativas === 0 ? 'sem demandas ativas' : `${ativas} demanda${ativas === 1 ? '' : 's'} ativa${ativas === 1 ? '' : 's'}`];
  if (emRisco > 0) partes.push(`${emRisco} com prazo crítico ou vencido`);
  if (atendimentosDoOrgao > 0) partes.push('já atendeu este órgão');
  return partes.join(' · ');
}

/**
 * Ordena os fiscais do mais indicado ao menos indicado para uma demanda deste órgão,
 * pela carga de trabalho de hoje. A decisão final continua sendo do gestor.
 */
export async function sugerirFiscais(demandanteId?: number): Promise<SugestaoFiscal[]> {
  const hoje = hojeNoFuso(env.TZ_NEGOCIO);
  const limiteCritico = paraData(adicionarDias(hoje, DIAS_PRAZO_CRITICO));
  const ativas = { status: { in: ['aberta', 'em_andamento'] as ('aberta' | 'em_andamento')[] } };

  const [fiscais, porAtivas, porRisco, porOrgao] = await Promise.all([
    prisma.fiscal.findMany({
      // Quem tem acesso ao sistema e está bloqueado não deve receber demandas
      where: { OR: [{ userId: null }, { user: { status: { not: 'bloqueado' } } }] },
      select: { id: true, nome: true, especialidade: true },
    }),
    prisma.demanda.groupBy({ by: ['fiscalId'], where: { ...ativas, fiscalId: { not: null } }, _count: { _all: true } }),
    prisma.demanda.groupBy({
      by: ['fiscalId'],
      where: { ...ativas, fiscalId: { not: null }, prazo: { lte: limiteCritico } },
      _count: { _all: true },
    }),
    demandanteId
      ? prisma.demanda.groupBy({
          by: ['fiscalId'],
          // Demandas em análise ainda não são trabalho formal do fiscal
          where: { demandanteId, fiscalId: { not: null }, status: { not: 'em_analise' } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const contagem = (grupos: { fiscalId: number | null; _count: { _all: number } }[]) =>
    new Map(grupos.map((g) => [g.fiscalId, g._count._all]));
  const mapaAtivas = contagem(porAtivas);
  const mapaRisco = contagem(porRisco);
  const mapaOrgao = contagem(porOrgao);

  const sugestoes = fiscais
    .map((fiscal) => {
      const quantasAtivas = mapaAtivas.get(fiscal.id) ?? 0;
      const emRisco = mapaRisco.get(fiscal.id) ?? 0;
      const atendimentos = mapaOrgao.get(fiscal.id) ?? 0;
      return {
        fiscalId: fiscal.id,
        nome: fiscal.nome,
        especialidade: fiscal.especialidade,
        ativas: quantasAtivas,
        emRisco,
        atendimentosDoOrgao: atendimentos,
        pontos: calcularPontos(quantasAtivas, emRisco, atendimentos),
        sugerido: false,
        resumo: resumir(quantasAtivas, emRisco, atendimentos),
      };
    })
    .sort((a, b) => a.pontos - b.pontos || a.nome.localeCompare(b.nome, 'pt-BR'));

  if (sugestoes[0]) sugestoes[0].sugerido = true;
  return sugestoes;
}
