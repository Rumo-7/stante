import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './cliente';

export interface Notificacao {
  id: number;
  tipo: string;
  mensagem: string;
  demandaId: number | null;
  lida: boolean;
  criadaEm: string;
}

export interface ListaNotificacoes {
  naoLidas: number;
  itens: Notificacao[];
}

/** Consulta a cada minuto enquanto a aba está aberta: o sino se atualiza sem recarregar a página. */
export const useNotificacoes = (habilitado: boolean) =>
  useQuery({
    queryKey: ['notificacoes'],
    queryFn: () => api.get<ListaNotificacoes>('/notificacoes?limite=20'),
    enabled: habilitado,
    refetchInterval: 60_000,
  });

export function useMarcarLida() {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<{ ok: boolean }>(`/notificacoes/${id}/lida`),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['notificacoes'] }),
  });
}

export function useMarcarTodasLidas() {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ marcadas: number }>('/notificacoes/lidas'),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['notificacoes'] }),
  });
}
