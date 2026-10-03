import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { adicionarDias, hojeNoFuso } from '@stante/shared';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { hashSenha } from '../../auth/senha';
import {
  criarDemanda,
  criarDemandante,
  criarFiscal,
  criarUsuarioComSessao,
  data,
  limparBanco,
} from '../../test/fixtures';

const app = createApp();

beforeEach(limparBanco);
afterAll(() => prisma.$disconnect());

const alterar = (cookie: string, id: number, corpo: object) =>
  request(app).patch(`/api/usuarios/${id}`).set('Cookie', cookie).send(corpo);

describe('acesso', () => {
  it('exige login', async () => {
    await request(app).get('/api/usuarios').expect(401);
    await request(app).patch('/api/usuarios/1').send({ status: 'ativo' }).expect(401);
  });

  it('só o gestor administra contas', async () => {
    const alvo = await criarUsuarioComSessao('inspetor', { status: 'pendente' });
    for (const perfil of ['inspetor', 'representante'] as const) {
      const { cookie } = await criarUsuarioComSessao(perfil);
      await request(app).get('/api/usuarios').set('Cookie', cookie).expect(403);
      await alterar(cookie, alvo.user.id, { status: 'ativo' }).expect(403);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alvo.user.id } })).status).toBe('pendente');
  });
});

describe('GET /api/usuarios', () => {
  it('lista quem espera aprovação primeiro e filtra por status', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    await criarUsuarioComSessao('inspetor', { status: 'bloqueado' });
    await criarUsuarioComSessao('representante');
    await criarUsuarioComSessao('inspetor', { status: 'pendente' });

    const todos = await request(app).get('/api/usuarios').set('Cookie', gestor.cookie).expect(200);
    const ordem = ['pendente', 'ativo', 'bloqueado'];
    const indices = todos.body.map((u: { status: string }) => ordem.indexOf(u.status));
    expect(todos.body).toHaveLength(4);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(todos.body[0].status).toBe('pendente');

    const pendentes = await request(app).get('/api/usuarios?status=pendente').set('Cookie', gestor.cookie).expect(200);
    expect(pendentes.body).toHaveLength(1);

    await request(app).get('/api/usuarios?status=qualquer').set('Cookie', gestor.cookie).expect(400);
  });

  it('nunca expõe o hash da senha e mostra os vínculos', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const inspetor = await criarUsuarioComSessao('inspetor');
    await criarFiscal('Fiscal Vinculado', inspetor.user.id);
    const orgao = await criarDemandante('Órgão Vinculado');
    await criarUsuarioComSessao('representante', { demandanteId: orgao.id });

    const res = await request(app).get('/api/usuarios').set('Cookie', gestor.cookie).expect(200);
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i);

    const doInspetor = res.body.find((u: { id: number }) => u.id === inspetor.user.id);
    expect(doInspetor).toMatchObject({ fiscal: 'Fiscal Vinculado', demandante: null });
    const doRepresentante = res.body.find((u: { perfil: string }) => u.perfil === 'representante');
    expect(doRepresentante).toMatchObject({ demandante: 'Órgão Vinculado', fiscal: null });
  });
});

describe('aprovar e bloquear', () => {
  it('aprovar libera o login', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const pendente = await prisma.user.create({
      data: {
        nome: 'Nova Pessoa',
        email: 'nova@exemplo.com',
        senhaHash: await hashSenha('senha-segura-123'),
        perfil: 'inspetor',
        status: 'pendente',
      },
    });
    const login = () => request(app).post('/api/login').send({ email: 'nova@exemplo.com', senha: 'senha-segura-123' });

    await login().expect(403);
    const res = await alterar(gestor.cookie, pendente.id, { status: 'ativo' }).expect(200);
    expect(res.body.status).toBe('ativo');
    await login().expect(200);
  });

  it('bloquear derruba as sessões abertas', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const alvo = await criarUsuarioComSessao('inspetor');
    await request(app).get('/api/me').set('Cookie', alvo.cookie).expect(200);

    await alterar(gestor.cookie, alvo.user.id, { status: 'bloqueado' }).expect(200);

    await request(app).get('/api/me').set('Cookie', alvo.cookie).expect(401);
    expect(await prisma.sessao.count({ where: { userId: alvo.user.id } })).toBe(0);
  });

  it('o gestor não altera a própria conta', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const res = await alterar(gestor.cookie, gestor.user.id, { status: 'bloqueado' });
    expect(res.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: gestor.user.id } })).status).toBe('ativo');
  });

  it.each([
    ['status "pendente"', { status: 'pendente' }, 'Status inválido.'],
    ['perfil desconhecido', { perfil: 'dono' }, 'Perfil inválido.'],
    ['corpo vazio', {}, 'Nada para atualizar.'],
  ])('rejeita %s', async (_nome, corpo, mensagem) => {
    const gestor = await criarUsuarioComSessao('gestor');
    const alvo = await criarUsuarioComSessao('inspetor');
    const res = await alterar(gestor.cookie, alvo.user.id, corpo);
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe(mensagem);
  });

  it('usuário inexistente ou id inválido responde 404', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    await alterar(gestor.cookie, 999999, { status: 'ativo' }).expect(404);
    await request(app).patch('/api/usuarios/abc').set('Cookie', gestor.cookie).send({ status: 'ativo' }).expect(404);
  });
});

describe('vínculo do inspetor com um fiscal', () => {
  it('vincular dá ao inspetor acesso às demandas do fiscal', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const inspetor = await criarUsuarioComSessao('inspetor');
    const fiscal = await criarFiscal('Fiscal A');
    const orgao = await criarDemandante();
    await criarDemanda({ demandanteId: orgao.id, fiscalId: fiscal.id, assunto: 'do fiscal A', prazo: data(adicionarDias(hojeNoFuso(), 30)) });

    const antes = await request(app).get('/api/demandas').set('Cookie', inspetor.cookie).expect(200);
    expect(antes.body).toEqual([]);

    const res = await alterar(gestor.cookie, inspetor.user.id, { fiscalId: fiscal.id }).expect(200);
    expect(res.body).toMatchObject({ fiscalId: fiscal.id, fiscal: 'Fiscal A' });

    const depois = await request(app).get('/api/demandas').set('Cookie', inspetor.cookie).expect(200);
    expect(depois.body.map((d: { assunto: string }) => d.assunto)).toEqual(['do fiscal A']);
  });

  it('trocar o fiscal solta o anterior; null remove o vínculo', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const inspetor = await criarUsuarioComSessao('inspetor');
    const primeiro = await criarFiscal('Primeiro', inspetor.user.id);
    const segundo = await criarFiscal('Segundo');

    await alterar(gestor.cookie, inspetor.user.id, { fiscalId: segundo.id }).expect(200);
    expect((await prisma.fiscal.findUniqueOrThrow({ where: { id: primeiro.id } })).userId).toBeNull();
    expect((await prisma.fiscal.findUniqueOrThrow({ where: { id: segundo.id } })).userId).toBe(inspetor.user.id);

    await alterar(gestor.cookie, inspetor.user.id, { fiscalId: null }).expect(200);
    expect((await prisma.fiscal.findUniqueOrThrow({ where: { id: segundo.id } })).userId).toBeNull();
  });

  it('um fiscal não pode ser de dois usuários', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const dono = await criarUsuarioComSessao('inspetor');
    const outro = await criarUsuarioComSessao('inspetor');
    const fiscal = await criarFiscal('Disputado', dono.user.id);

    const res = await alterar(gestor.cookie, outro.user.id, { fiscalId: fiscal.id });
    expect(res.status).toBe(409);
    expect((await prisma.fiscal.findUniqueOrThrow({ where: { id: fiscal.id } })).userId).toBe(dono.user.id);
  });

  it('fiscal inexistente e perfil errado são recusados', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const inspetor = await criarUsuarioComSessao('inspetor');
    const representante = await criarUsuarioComSessao('representante');
    const fiscal = await criarFiscal('Qualquer');

    expect((await alterar(gestor.cookie, inspetor.user.id, { fiscalId: 999999 })).body.erro).toBe('Fiscal não encontrado.');
    const perfilErrado = await alterar(gestor.cookie, representante.user.id, { fiscalId: fiscal.id });
    expect(perfilErrado.status).toBe(400);
    expect(perfilErrado.body.erro).toBe('Só inspetores podem ser vinculados a um fiscal.');
  });

  it('mudar o perfil para outro que não inspetor solta o fiscal', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const inspetor = await criarUsuarioComSessao('inspetor');
    const fiscal = await criarFiscal('Vai soltar', inspetor.user.id);

    const res = await alterar(gestor.cookie, inspetor.user.id, { perfil: 'gestor' }).expect(200);
    expect(res.body).toMatchObject({ perfil: 'gestor', fiscalId: null });
    expect((await prisma.fiscal.findUniqueOrThrow({ where: { id: fiscal.id } })).userId).toBeNull();
  });
});

describe('vínculo do representante com um órgão', () => {
  it('vincula, troca e remove', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const representante = await criarUsuarioComSessao('representante');
    const orgaoA = await criarDemandante('Órgão A');
    const orgaoB = await criarDemandante('Órgão B');

    const vinculado = await alterar(gestor.cookie, representante.user.id, { demandanteId: orgaoA.id }).expect(200);
    expect(vinculado.body).toMatchObject({ demandanteId: orgaoA.id, demandante: 'Órgão A' });

    const trocado = await alterar(gestor.cookie, representante.user.id, { demandanteId: String(orgaoB.id) }).expect(200);
    expect(trocado.body.demandanteId).toBe(orgaoB.id);

    const removido = await alterar(gestor.cookie, representante.user.id, { demandanteId: null }).expect(200);
    expect(removido.body.demandanteId).toBeNull();
  });

  it('recusa órgão inexistente e perfil errado', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const representante = await criarUsuarioComSessao('representante');
    const inspetor = await criarUsuarioComSessao('inspetor');
    const orgao = await criarDemandante();

    expect((await alterar(gestor.cookie, representante.user.id, { demandanteId: 999999 })).body.erro).toBe('Órgão não encontrado.');
    expect((await alterar(gestor.cookie, inspetor.user.id, { demandanteId: orgao.id })).status).toBe(400);
  });

  it('mudar o perfil para outro que não representante limpa o órgão', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const orgao = await criarDemandante();
    const representante = await criarUsuarioComSessao('representante', { demandanteId: orgao.id });

    const res = await alterar(gestor.cookie, representante.user.id, { perfil: 'inspetor' }).expect(200);
    expect(res.body).toMatchObject({ perfil: 'inspetor', demandanteId: null });
  });
});
