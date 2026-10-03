import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AtualizarDemandanteInput, CriarDemandanteInput } from '@stante/shared';
import { montarQuery } from '../util/query';
import { api } from './cliente';
import type { Demandante } from './demandas';

export interface EstatisticasOrgao {
  id: number;
  nome: string;
  tipo: string;
  tipoRotulo: string;
  recebidas: number;
  concluidas: number;
  noPrazo: number;
  foraDoPrazo: number;
  emAberto: number;
  vencidas: number;
  /** Frações de 0 a 1. Null quando não há base para calcular. */
  taxaConclusao: number | null;
  pontualidade: number | null;
  medianaDias: number | null;
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

export interface Estatisticas {
  periodo: { de: string | null; ate: string | null };
  resumo: ResumoEstatisticas;
  orgaos: EstatisticasOrgao[];
}

/** O período é o de cadastro: vale a coorte "recebidas no período, com a situação de hoje". */
export const useEstatisticasDemandantes = (periodo: { de?: string; ate?: string }) =>
  useQuery({
    queryKey: ['demandantes', 'estatisticas', periodo],
    queryFn: () => api.get<Estatisticas>(`/demandantes/estatisticas${montarQuery(periodo)}`),
  });

export function useCriarOrgao() {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: (dados: CriarDemandanteInput) => api.post<Demandante>('/demandantes', dados),
    // A chave começa com "demandantes": a lista do formulário e as estatísticas se atualizam juntas
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['demandantes'] }),
  });
}

export function useAtualizarOrgao() {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }: { id: number; dados: AtualizarDemandanteInput }) =>
      api.patch<Demandante>(`/demandantes/${id}`, dados),
    // O nome do órgão aparece nas demandas e no dashboard
    onSuccess: () =>
      Promise.all([
        clienteQuery.invalidateQueries({ queryKey: ['demandantes'] }),
        clienteQuery.invalidateQueries({ queryKey: ['demandas'] }),
        clienteQuery.invalidateQueries({ queryKey: ['dashboard'] }),
      ]),
  });
}
