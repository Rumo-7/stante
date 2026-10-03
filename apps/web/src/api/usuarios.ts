import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AtualizarUsuarioInput, Perfil, StatusUsuario } from '@stante/shared';
import { api } from './cliente';

export interface UsuarioAdmin {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  status: StatusUsuario;
  criadoEm: string;
  fiscalId: number | null;
  fiscal: string | null;
  demandanteId: number | null;
  demandante: string | null;
}

export const useUsuarios = (status?: StatusUsuario, habilitado = true) =>
  useQuery({
    queryKey: ['usuarios', status ?? 'todos'],
    queryFn: () => api.get<UsuarioAdmin[]>(`/usuarios${status ? `?status=${status}` : ''}`),
    enabled: habilitado,
    // O contador de pendentes na barra de navegação se atualiza sozinho, sem recarregar a página
    refetchInterval: status === 'pendente' ? 60_000 : false,
  });

export function useAtualizarUsuario() {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dados }: { id: number; dados: AtualizarUsuarioInput }) =>
      api.patch<UsuarioAdmin>(`/usuarios/${id}`, dados),
    onSuccess: () =>
      Promise.all([
        clienteQuery.invalidateQueries({ queryKey: ['usuarios'] }),
        clienteQuery.invalidateQueries({ queryKey: ['fiscais'] }),
      ]),
  });
}

/** O gestor gera uma senha provisória para alguém que perdeu a sua. Ela só é devolvida esta vez. */
export function useRedefinirSenha() {
  return useMutation({
    mutationFn: (id: number) => api.post<{ senhaProvisoria: string }>(`/usuarios/${id}/redefinir-senha`),
  });
}
