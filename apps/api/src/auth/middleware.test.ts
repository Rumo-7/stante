import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ErroHttp } from '../http/erros';
import { exigirPerfil } from './middleware';

const executar = (usuario: Request['usuario'], ...perfis: Parameters<typeof exigirPerfil>) => {
  const next = vi.fn();
  const chamar = () => exigirPerfil(...perfis)({ usuario } as Request, {} as Response, next);
  return { chamar, next };
};

const usuario = (perfil: 'gestor' | 'inspetor' | 'representante') => ({
  id: 1,
  nome: 'x',
  email: 'x@x.com',
  perfil,
  fiscalId: null,
  demandanteId: null,
});

describe('exigirPerfil', () => {
  it('deixa passar um perfil permitido', () => {
    const { chamar, next } = executar(usuario('gestor'), 'gestor');
    chamar();
    expect(next).toHaveBeenCalledOnce();
  });

  it('responde 403 para perfil não permitido', () => {
    const { chamar, next } = executar(usuario('inspetor'), 'gestor');
    expect(chamar).toThrowError(ErroHttp);
    expect(chamar).toThrowError('Você não tem permissão para esta ação.');
    expect(next).not.toHaveBeenCalled();
  });

  it('responde 401 sem usuário logado', () => {
    const { chamar } = executar(undefined, 'gestor');
    try {
      chamar();
    } catch (erro) {
      expect((erro as ErroHttp).status).toBe(401);
    }
  });
});
