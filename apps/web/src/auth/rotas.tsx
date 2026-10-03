import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Perfil } from '@stante/shared';
import { buscarUsuario, type Usuario } from '../api/auth';

export const CHAVE_USUARIO = ['usuario'] as const;

export function useUsuario() {
  return useQuery({ queryKey: CHAVE_USUARIO, queryFn: buscarUsuario, staleTime: Infinity });
}

/** Para telas protegidas: o usuário nunca é nulo ali (a rota já redirecionou). */
export function useUsuarioLogado(): Usuario {
  const { data } = useUsuario();
  if (!data) throw new Error('useUsuarioLogado usado fora de uma rota protegida.');
  return data;
}

function Carregando() {
  return <div className="tela-central">Carregando…</div>;
}

/** Só deixa passar quem está logado; os demais vão para o login. */
export function RotaProtegida() {
  const { data: usuario, isPending, isError } = useUsuario();
  const local = useLocation();

  if (isPending) return <Carregando />;
  if (isError) return <div className="tela-central">Erro ao conectar com o servidor.</div>;
  if (!usuario) return <Navigate to="/login" replace state={{ de: local.pathname }} />;
  return <Outlet />;
}

/** Telas de login e cadastro: quem já está logado é mandado para o painel. */
export function RotaPublica() {
  const { data: usuario, isPending } = useUsuario();
  if (isPending) return <Carregando />;
  if (usuario) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** Restringe uma tela a certos perfis (a API continua sendo quem de fato garante isso). */
export function SomentePerfil({ perfis, children }: { perfis: Perfil[]; children: ReactNode }) {
  const usuario = useUsuarioLogado();
  if (!perfis.includes(usuario.perfil)) return <Navigate to="/dashboard" replace />;
  return children;
}
