import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { StatusDemanda, StatusExibicao } from '@stante/shared';
import { montarQuery } from '../util/query';
import { api } from './cliente';

/** Status que uma pessoa pode definir à mão ("em análise" só sai pela validação do gestor). */
export type StatusDemandaEditavel = Exclude<StatusDemanda, 'em_analise'>;

export interface Demanda {
  id: number;
  numero: string;
  demandanteId: number;
  demandante: string;
  assunto: string;
  fiscalId: number | null;
  fiscal: string | null;
  prazo: string;
  /** Status mostrado: o salvo, ajustado pelo prazo (pode ser "vencida" ou "prazo_critico"). */
  status: StatusExibicao;
  /** Status gravado de fato. */
  statusSalvo: StatusDemanda;
  origem: 'planejada' | 'campo';
  validadaEm: string | null;
}

export interface FiltrosDemandas {
  de?: string;
  ate?: string;
  status?: string;
  busca?: string;
  fiscalId?: string;
  demandanteId?: string;
  /** Período em que a demanda foi cadastrada (o dia conta no fuso de Recife). */
  criadasDe?: string;
  criadasAte?: string;
  ordenar?: 'prazo' | 'recentes';
  limite?: number;
  /** Página a partir de 1; sem "limite", cada página tem 20 itens. */
  pagina?: number;
  /** Só demandas formais em andamento: sem as concluídas e sem as em análise. */
  ativas?: boolean;
}

export interface Demandante {
  id: number;
  nome: string;
  tipo: string;
  tipoRotulo: string;
}

export const useDemandas = (filtros: FiltrosDemandas = {}, habilitado = true) =>
  useQuery({
    queryKey: ['demandas', filtros],
    queryFn: () => api.get<Demanda[]>(`/demandas${montarQuery(filtros)}`),
    enabled: habilitado,
  });

/**
 * A lista em páginas, com o total de resultados do filtro. A chave começa com "demandas",
 * então criar ou alterar uma demanda já atualiza a página aberta. Ao trocar de página, a
 * anterior continua na tela até a nova chegar (sem a tabela piscar vazia).
 */
export const useDemandasPaginadas = (filtros: FiltrosDemandas) =>
  useQuery({
    queryKey: ['demandas', 'pagina', filtros],
    queryFn: () => api.lista<Demanda>(`/demandas${montarQuery(filtros)}`),
    placeholderData: keepPreviousData,
  });

/** Uma demanda só (abre o detalhe sem depender de ela estar na página atual da lista). */
export const useDemanda = (id: number | null) =>
  useQuery({
    queryKey: ['demandas', 'detalhe', id],
    queryFn: () => api.get<Demanda>(`/demandas/${id}`),
    enabled: id !== null,
  });

/** Só gestor e inspetor listam órgãos; para o representante a consulta não deve ser feita. */
export const useDemandantes = (habilitado = true) =>
  useQuery({
    queryKey: ['demandantes'],
    queryFn: () => api.get<Demandante[]>('/demandantes'),
    enabled: habilitado,
  });

export const criarDemandante = (nome: string) => api.post<Demandante>('/demandantes', { nome });

/** Atualiza as telas que dependem das demandas (lista, indicadores e carga dos fiscais). */
function invalidarDemandas(clienteQuery: QueryClient) {
  return Promise.all([
    clienteQuery.invalidateQueries({ queryKey: ['demandas'] }),
    clienteQuery.invalidateQueries({ queryKey: ['dashboard'] }),
    clienteQuery.invalidateQueries({ queryKey: ['fiscais'] }),
    clienteQuery.invalidateQueries({ queryKey: ['historico'] }),
    clienteQuery.invalidateQueries({ queryKey: ['radar'] }),
  ]);
}

/** Cria a demanda (com anexos, se houver) e atualiza as telas que dependem dela. */
export function useCriarDemanda() {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: (formulario: FormData) => api.post<Demanda>('/demandas', formulario),
    onSuccess: () => invalidarDemandas(clienteQuery),
  });
}

export interface AlteracaoDemanda {
  status?: StatusDemandaEditavel;
  fiscalId?: number | null;
  /** Obrigatório ao reabrir uma demanda concluída (só o gestor pode). */
  motivo?: string;
}

export function useAtualizarDemanda() {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }: { id: number; dados: AlteracaoDemanda }) =>
      api.patch<Demanda>(`/demandas/${id}`, dados),
    onSuccess: () => invalidarDemandas(clienteQuery),
  });
}

export function useValidarDemanda() {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }: { id: number; dados: { fiscalId?: number | null; prazo?: string } }) =>
      api.post<Demanda>(`/demandas/${id}/validar`, dados),
    onSuccess: () => invalidarDemandas(clienteQuery),
  });
}
