import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { StatusDemanda, StatusExibicao } from '@stante/shared';
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
  ordenar?: 'prazo' | 'recentes';
  limite?: number;
  /** Só demandas formais em andamento: sem as concluídas e sem as em análise. */
  ativas?: boolean;
}

export interface Demandante {
  id: number;
  nome: string;
  tipo: string;
  tipoRotulo: string;
}

function montarQuery(filtros: FiltrosDemandas): string {
  const parametros = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== '' && valor !== false) parametros.set(chave, String(valor));
  }
  const texto = parametros.toString();
  return texto ? `?${texto}` : '';
}

export const useDemandas = (filtros: FiltrosDemandas = {}, habilitado = true) =>
  useQuery({
    queryKey: ['demandas', filtros],
    queryFn: () => api.get<Demanda[]>(`/demandas${montarQuery(filtros)}`),
    enabled: habilitado,
  });

export const useDemandantes = () =>
  useQuery({ queryKey: ['demandantes'], queryFn: () => api.get<Demandante[]>('/demandantes') });

export const criarDemandante = (nome: string) => api.post<Demandante>('/demandantes', { nome });

/** Atualiza as telas que dependem das demandas (lista, indicadores e carga dos fiscais). */
function invalidarDemandas(clienteQuery: QueryClient) {
  return Promise.all([
    clienteQuery.invalidateQueries({ queryKey: ['demandas'] }),
    clienteQuery.invalidateQueries({ queryKey: ['dashboard'] }),
    clienteQuery.invalidateQueries({ queryKey: ['fiscais'] }),
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
