import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './cliente';

export interface Anexo {
  id: number;
  nomeOriginal: string;
  tamanho: number | null;
  enviadoPorId: number | null;
  criadoEm: string;
}

export const useAnexos = (demandaId: number) =>
  useQuery({
    queryKey: ['anexos', demandaId],
    queryFn: () => api.get<Anexo[]>(`/demandas/${demandaId}/anexos`),
  });

/** Enviar ou remover anexo muda a lista de anexos e acrescenta uma linha ao histórico. */
const atualizarAnexosEHistorico = (clienteQuery: QueryClient, demandaId: number) =>
  Promise.all([
    clienteQuery.invalidateQueries({ queryKey: ['anexos', demandaId] }),
    clienteQuery.invalidateQueries({ queryKey: ['historico', demandaId] }),
  ]);

export function useEnviarAnexos(demandaId: number) {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: (arquivos: File[]) => {
      const formulario = new FormData();
      arquivos.forEach((arquivo) => formulario.append('anexos', arquivo));
      return api.post<Anexo[]>(`/demandas/${demandaId}/anexos`, formulario);
    },
    onSuccess: () => atualizarAnexosEHistorico(clienteQuery, demandaId),
  });
}

export function useRemoverAnexo(demandaId: number) {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: (anexoId: number) => api.delete<{ mensagem: string }>(`/anexos/${anexoId}`),
    onSuccess: () => atualizarAnexosEHistorico(clienteQuery, demandaId),
  });
}
