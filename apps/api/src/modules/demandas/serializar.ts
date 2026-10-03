import type { Prisma } from '@prisma/client';
import { numeroDemanda, statusExibicao } from '@stante/shared';

export const INCLUIR_RELACOES = { demandante: true, fiscal: true } satisfies Prisma.DemandaInclude;

type DemandaComRelacoes = Prisma.DemandaGetPayload<{ include: typeof INCLUIR_RELACOES }>;

export function serializarDemanda(demanda: DemandaComRelacoes, hoje: string) {
  const prazo = demanda.prazo.toISOString().slice(0, 10);
  return {
    id: demanda.id,
    numero: numeroDemanda(demanda.id),
    demandanteId: demanda.demandanteId,
    demandante: demanda.demandante.nome,
    assunto: demanda.assunto,
    fiscalId: demanda.fiscalId,
    fiscal: demanda.fiscal?.nome ?? null,
    prazo,
    status: statusExibicao(demanda.status, prazo, hoje),
    origem: demanda.origem,
    validadaEm: demanda.validadaEm?.toISOString() ?? null,
  };
}
