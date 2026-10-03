import type { Prisma } from '@prisma/client';
import {
  adicionarDias,
  DIAS_PRAZO_CRITICO,
  type ListarDemandasQuery,
  type StatusExibicao,
} from '@stante/shared';
import type { UsuarioLogado } from '../../auth/sessao';
import { escopoDemandas } from './escopo';

/** "AAAA-MM-DD" -> Date em UTC, que é como o Postgres entrega colunas DATE. */
export const paraData = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const FORMAIS = ['aberta', 'em_andamento'] as const;

/**
 * Traduz o status de exibição (calculado a partir do prazo) em uma condição SQL.
 * É o espelho de `statusExibicao` em @stante/shared: se uma regra mudar lá,
 * muda aqui também.
 */
export function filtroStatus(status: StatusExibicao, hoje: string): Prisma.DemandaWhereInput {
  const inicioHoje = paraData(hoje);
  const limiteCritico = paraData(adicionarDias(hoje, DIAS_PRAZO_CRITICO));

  switch (status) {
    case 'concluida':
    case 'em_analise':
      return { status };
    case 'vencida':
      return { status: { in: [...FORMAIS] }, prazo: { lt: inicioHoje } };
    case 'prazo_critico':
      return { status: { in: [...FORMAIS] }, prazo: { gte: inicioHoje, lte: limiteCritico } };
    default:
      return { status, prazo: { gt: limiteCritico } };
  }
}

export function montarWhere(
  consulta: ListarDemandasQuery,
  usuario: UsuarioLogado,
  hoje: string,
): Prisma.DemandaWhereInput {
  const condicoes: Prisma.DemandaWhereInput[] = [escopoDemandas(usuario)];

  if (consulta.de) condicoes.push({ prazo: { gte: paraData(consulta.de) } });
  if (consulta.ate) condicoes.push({ prazo: { lte: paraData(consulta.ate) } });
  if (consulta.status) condicoes.push(filtroStatus(consulta.status, hoje));
  if (consulta.fiscalId) condicoes.push({ fiscalId: consulta.fiscalId });
  if (consulta.ativas) condicoes.push({ status: { in: [...FORMAIS] } });

  if (consulta.busca) {
    const termo = consulta.busca;
    const alternativas: Prisma.DemandaWhereInput[] = [
      { assunto: { contains: termo, mode: 'insensitive' } },
      { demandante: { nome: { contains: termo, mode: 'insensitive' } } },
      { fiscal: { nome: { contains: termo, mode: 'insensitive' } } },
    ];
    // "DEM-0007", "dem7" ou "7" encontram a demanda de id 7 (limite de dígitos evita estourar o Int do Postgres)
    const numero = /^(?:dem-?)?0*(\d{1,9})$/i.exec(termo);
    if (numero?.[1]) alternativas.push({ id: Number(numero[1]) });
    condicoes.push({ OR: alternativas });
  }

  return { AND: condicoes };
}
