import type { NextFunction, Request, Response } from 'express';
import type { Perfil } from '@stante/shared';
import { ErroHttp } from '../http/erros';
import { COOKIE_SESSAO, usuarioDaSessao, type UsuarioLogado } from './sessao';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioLogado;
    }
  }
}

/** Lê o cookie de sessão e, se for válido, preenche `req.usuario`. Não bloqueia ninguém. */
export async function carregarUsuario(req: Request, _res: Response, next: NextFunction) {
  const token: unknown = req.cookies?.[COOKIE_SESSAO];
  if (typeof token === 'string' && token) {
    req.usuario = (await usuarioDaSessao(token)) ?? undefined;
  }
  next();
}

export function exigirLogin(req: Request, _res: Response, next: NextFunction) {
  if (!req.usuario) throw new ErroHttp(401, 'Faça login para continuar.');
  next();
}

/**
 * Quem acabou de receber uma senha provisória só pode trocá-la (rotas de conta,
 * montadas antes deste guarda). Todo o resto da API fica fechado até lá.
 */
export function exigirSenhaDefinitiva(req: Request, _res: Response, next: NextFunction) {
  if (req.usuario?.precisaTrocarSenha) {
    throw new ErroHttp(403, 'Troque a senha provisória para continuar.');
  }
  next();
}

export function exigirPerfil(...perfis: Perfil[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario) throw new ErroHttp(401, 'Faça login para continuar.');
    if (!perfis.includes(req.usuario.perfil)) {
      throw new ErroHttp(403, 'Você não tem permissão para esta ação.');
    }
    next();
  };
}

/**
 * Defesa extra contra CSRF (além do cookie SameSite=Lax): requisições que
 * alteram dados e trazem um Origin de outro site são recusadas.
 */
export function verificarOrigem(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origem = req.get('origin');
  if (origem) {
    let mesmoHost = false;
    try {
      mesmoHost = new URL(origem).host === req.host;
    } catch {
      // Origin malformado ou "null": trata como estrangeiro
    }
    if (!mesmoHost) throw new ErroHttp(403, 'Origem não permitida.');
  }
  next();
}
