import type { CadastroInput, LoginInput, Perfil, TrocarSenhaInput } from '@stante/shared';
import { api, ErroApi } from './cliente';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  /** Depois de uma redefinição pelo gestor: a pessoa só pode trocar a senha, nada mais. */
  precisaTrocarSenha: boolean;
}

/** O usuário da sessão atual, ou null se não houver login (401 não é um erro aqui). */
export async function buscarUsuario(): Promise<Usuario | null> {
  try {
    return await api.get<Usuario>('/me');
  } catch (erro) {
    if (erro instanceof ErroApi && erro.status === 401) return null;
    throw erro;
  }
}

export const entrar = (dados: LoginInput) => api.post<{ nome: string; email: string; perfil: Perfil }>('/login', dados);

export const sair = () => api.post<void>('/logout');

export const trocarSenha = (dados: TrocarSenhaInput) => api.post<{ ok: boolean }>('/me/senha', dados);

export const cadastrar = (dados: CadastroInput) => api.post<{ mensagem: string }>('/cadastro', dados);
