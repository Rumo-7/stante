import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CriarFiscalInput } from '@stante/shared';
import { api } from './cliente';

export interface Fiscal {
  id: number;
  nome: string;
  especialidade: string | null;
  /** Usuário que tem este fiscal como "ele mesmo" (inspetor com acesso ao sistema). */
  usuarioId: number | null;
  demandas_ativas: number;
}

/** A lista de fiscais é só do gestor; para os demais a consulta nem é feita. */
export const useFiscais = (habilitado: boolean) =>
  useQuery({ queryKey: ['fiscais'], queryFn: () => api.get<Fiscal[]>('/fiscais'), enabled: habilitado });

export interface SugestaoFiscal {
  fiscalId: number;
  nome: string;
  especialidade: string | null;
  ativas: number;
  emRisco: number;
  atendimentosDoOrgao: number;
  pontos: number;
  /** O primeiro do ranking: quem tem menos carga (e, em empate, já atendeu o órgão). */
  sugerido: boolean;
  resumo: string;
}

/**
 * Fiscais do mais ao menos indicado para uma demanda do órgão informado.
 * A chave começa com "fiscais", então atribuir ou concluir demandas já atualiza o ranking.
 */
export const useSugestoesFiscais = (demandanteId: number | null, habilitado: boolean) =>
  useQuery({
    queryKey: ['fiscais', 'sugestoes', demandanteId],
    queryFn: () =>
      api.get<SugestaoFiscal[]>(`/fiscais/sugestoes${demandanteId ? `?demandanteId=${demandanteId}` : ''}`),
    enabled: habilitado,
  });

export function useCriarFiscal() {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: (dados: CriarFiscalInput) => api.post<Fiscal>('/fiscais', dados),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['fiscais'] }),
  });
}
