import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StatusExibicao } from '@stante/shared';
import { api } from './cliente';

export interface Demanda {
  id: number;
  numero: string;
  demandanteId: number;
  demandante: string;
  assunto: string;
  fiscalId: number | null;
  fiscal: string | null;
  prazo: string;
  status: StatusExibicao;
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
}

export interface Demandante {
  id: number;
  nome: string;
  tipo: string;
  tipoRotulo: string;
}

export interface Fiscal {
  id: number;
  nome: string;
  especialidade: string | null;
  demandas_ativas: number;
}

function montarQuery(filtros: FiltrosDemandas): string {
  const parametros = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== '') parametros.set(chave, String(valor));
  }
  const texto = parametros.toString();
  return texto ? `?${texto}` : '';
}

export const useDemandas = (filtros: FiltrosDemandas = {}) =>
  useQuery({
    queryKey: ['demandas', filtros],
    queryFn: () => api.get<Demanda[]>(`/demandas${montarQuery(filtros)}`),
  });

export const useDemandantes = () =>
  useQuery({ queryKey: ['demandantes'], queryFn: () => api.get<Demandante[]>('/demandantes') });

/** A lista de fiscais é só do gestor; para os demais a consulta nem é feita. */
export const useFiscais = (habilitado: boolean) =>
  useQuery({ queryKey: ['fiscais'], queryFn: () => api.get<Fiscal[]>('/fiscais'), enabled: habilitado });

export const criarDemandante = (nome: string) => api.post<Demandante>('/demandantes', { nome });

/** Cria a demanda (com anexos, se houver) e atualiza as telas que dependem dela. */
export function useCriarDemanda() {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: (formulario: FormData) => api.post<Demanda>('/demandas', formulario),
    onSuccess: () =>
      Promise.all([
        clienteQuery.invalidateQueries({ queryKey: ['demandas'] }),
        clienteQuery.invalidateQueries({ queryKey: ['dashboard'] }),
      ]),
  });
}
