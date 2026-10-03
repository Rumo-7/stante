import { createHash, randomBytes } from 'node:crypto';
import type { Perfil } from '@stante/shared';
import { prisma } from '../db';

export const COOKIE_SESSAO = 'stante_sid';
export const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000;

export interface UsuarioLogado {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  /** Preenchido para inspetores: o fiscal que corresponde a este usuário. */
  fiscalId: number | null;
  /** Preenchido para representantes: o órgão que eles acompanham. */
  demandanteId: number | null;
  /** Depois de uma redefinição pelo gestor: a pessoa só pode trocar a senha, nada mais. */
  precisaTrocarSenha: boolean;
}

const hashDoToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function criarSessao(userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.sessao.create({
    data: {
      id: hashDoToken(token),
      userId,
      expiraEm: new Date(Date.now() + DURACAO_SESSAO_MS),
    },
  });
  return token;
}

export async function usuarioDaSessao(token: string): Promise<UsuarioLogado | null> {
  const id = hashDoToken(token);
  const sessao = await prisma.sessao.findUnique({
    where: { id },
    include: { user: { include: { fiscal: { select: { id: true } } } } },
  });
  if (!sessao) return null;

  if (sessao.expiraEm <= new Date()) {
    await prisma.sessao.deleteMany({ where: { id } });
    return null;
  }

  // Conta bloqueada depois do login perde o acesso na hora.
  const { user } = sessao;
  if (user.status !== 'ativo') return null;

  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    perfil: user.perfil,
    fiscalId: user.fiscal?.id ?? null,
    demandanteId: user.demandanteId,
    precisaTrocarSenha: user.precisaTrocarSenha,
  };
}

export async function encerrarSessao(token: string): Promise<void> {
  await prisma.sessao.deleteMany({ where: { id: hashDoToken(token) } });
}

/** Encerra todas as sessões da pessoa, menos a atual (usado ao trocar a senha). */
export async function encerrarOutrasSessoes(userId: number, tokenAtual: string): Promise<void> {
  await prisma.sessao.deleteMany({ where: { userId, NOT: { id: hashDoToken(tokenAtual) } } });
}
