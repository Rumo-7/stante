import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function useEnviarAnexos(demandaId: number) {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: (arquivos: File[]) => {
      const formulario = new FormData();
      arquivos.forEach((arquivo) => formulario.append('anexos', arquivo));
      return api.post<Anexo[]>(`/demandas/${demandaId}/anexos`, formulario);
    },
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['anexos', demandaId] }),
  });
}

export function useRemoverAnexo(demandaId: number) {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: (anexoId: number) => api.delete<{ mensagem: string }>(`/anexos/${anexoId}`),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['anexos', demandaId] }),
  });
}
