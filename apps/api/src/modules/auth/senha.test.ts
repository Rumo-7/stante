import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { gerarSenhaProvisoria, hashSenha } from '../../auth/senha';
import { prisma } from '../../db';
import { criarUsuarioComSessao, limparBanco } from '../../test/fixtures';

const app = createApp();
const SENHA = 'senha-segura-123';

beforeEach(limparBanco);
afterAll(() => prisma.$disconnect());

/** Usuário ativo com senha de verdade (hash bcrypt) e já com uma sessão aberta. */
async function usuarioComSenha(perfil: 'gestor' | 'inspetor' = 'inspetor', senha = SENHA) {
  const criado = await criarUsuarioComSessao(perfil, { senhaHash: await hashSenha(senha) });
  return { ...criado, email: criado.user.email };
}

const entrar = (email: string, senha: string) => request(app).post('/api/login').send({ email, senha });

/** Faz login e devolve um "navegador" que guarda o cookie. */
async function navegador(email: string, senha: string) {
  const agente = request.agent(app);
  await agente.post('/api/login').send({ email, senha }).expect(200);
  return agente;
}

describe('POST /api/me/senha (trocar a própria senha)', () => {
  const corpo = { senhaAtual: SENHA, novaSenha: 'outra-senha-456', confirmarNovaSenha: 'outra-senha-456' };

  it('exige login', async () => {
    await request(app).post('/api/me/senha').send(corpo).expect(401);
  });

  it('troca a senha: a nova funciona, a antiga não, e as outras sessões caem', async () => {
    const { email } = await usuarioComSenha();
    const aqui = await navegador(email, SENHA);
    const outroLugar = await navegador(email, SENHA);

    await aqui.post('/api/me/senha').send(corpo).expect(200);

    await aqui.get('/api/me').expect(200); // a sessão de quem trocou continua valendo
    await outroLugar.get('/api/me').expect(401); // a do outro computador foi encerrada
    await entrar(email, 'outra-senha-456').expect(200);
    await entrar(email, SENHA).expect(401);
  });

  it('senha atual errada é recusada com 400 (não 401, que o front leria como "deslogado") e nada muda', async () => {
    const { email, cookie } = await usuarioComSenha();

    const res = await request(app)
      .post('/api/me/senha')
      .set('Cookie', cookie)
      .send({ ...corpo, senhaAtual: 'senha-que-nao-e-a-minha' });

    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Senha atual incorreta.');
    await entrar(email, SENHA).expect(200);
  });

  it.each([
    ['nova senha curta', { novaSenha: 'curta', confirmarNovaSenha: 'curta' }, 'A nova senha deve ter pelo menos 8 caracteres.'],
    ['confirmação diferente', { confirmarNovaSenha: 'nao-bate-com-a-nova' }, 'As senhas não coincidem.'],
    ['nova igual à atual', { novaSenha: SENHA, confirmarNovaSenha: SENHA }, 'A nova senha deve ser diferente da atual.'],
    ['nova longa demais para o bcrypt', { novaSenha: 'a'.repeat(73), confirmarNovaSenha: 'a'.repeat(73) }, 'A nova senha deve ter no máximo 72 caracteres.'],
  ])('rejeita %s', async (_nome, alteracao, mensagem) => {
    const { cookie } = await usuarioComSenha();
    const res = await request(app).post('/api/me/senha').set('Cookie', cookie).send({ ...corpo, ...alteracao });
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe(mensagem);
  });

  it('não guarda a senha em texto: só o hash', async () => {
    const { email, cookie, user } = await usuarioComSenha();
    await request(app).post('/api/me/senha').set('Cookie', cookie).send(corpo).expect(200);

    const salvo = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(salvo.senhaHash).not.toContain('outra-senha-456');
    expect(salvo.senhaHash).toMatch(/^\$2[aby]\$/);
    expect(email).toBeDefined();
  });
});

describe('POST /api/usuarios/:id/redefinir-senha (gestor)', () => {
  const redefinir = (cookie: string, id: number) =>
    request(app).post(`/api/usuarios/${id}/redefinir-senha`).set('Cookie', cookie);

  it('exige login e é só do gestor', async () => {
    const alvo = await usuarioComSenha();
    await request(app).post(`/api/usuarios/${alvo.user.id}/redefinir-senha`).expect(401);
    const inspetor = await usuarioComSenha();
    await redefinir(inspetor.cookie, alvo.user.id).expect(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alvo.user.id } })).precisaTrocarSenha).toBe(false);
  });

  it('sorteia uma senha provisória, mostrada uma vez e sem cache; a antiga deixa de valer', async () => {
    const gestor = await usuarioComSenha('gestor');
    const alvo = await usuarioComSenha();
    await request(app).get('/api/me').set('Cookie', alvo.cookie).expect(200);

    const res = await redefinir(gestor.cookie, alvo.user.id).expect(200);

    expect(res.body.senhaProvisoria).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
    expect(res.headers['cache-control']).toBe('no-store');
    const salvo = await prisma.user.findUniqueOrThrow({ where: { id: alvo.user.id } });
    expect(salvo.precisaTrocarSenha).toBe(true);
    expect(salvo.senhaHash).not.toContain(res.body.senhaProvisoria);

    await request(app).get('/api/me').set('Cookie', alvo.cookie).expect(401); // derrubou as sessões
    await entrar(alvo.email, SENHA).expect(401);
    await entrar(alvo.email, res.body.senhaProvisoria).expect(200);
  });

  it('com a senha provisória a pessoa só consegue trocá-la; depois tudo volta ao normal', async () => {
    const gestor = await usuarioComSenha('gestor');
    const alvo = await usuarioComSenha();
    const { body } = await redefinir(gestor.cookie, alvo.user.id).expect(200);

    const pessoa = await navegador(alvo.email, body.senhaProvisoria);

    const eu = await pessoa.get('/api/me').expect(200);
    expect(eu.body.precisaTrocarSenha).toBe(true);
    const bloqueada = await pessoa.get('/api/demandas');
    expect(bloqueada.status).toBe(403);
    expect(bloqueada.body.erro).toBe('Troque a senha provisória para continuar.');
    await pessoa.get('/api/dashboard').expect(403);
    await pessoa.get('/api/notificacoes').expect(403);

    await pessoa
      .post('/api/me/senha')
      .send({ senhaAtual: body.senhaProvisoria, novaSenha: 'minha-senha-nova-1', confirmarNovaSenha: 'minha-senha-nova-1' })
      .expect(200);

    await pessoa.get('/api/demandas').expect(200);
    expect((await pessoa.get('/api/me').expect(200)).body.precisaTrocarSenha).toBe(false);
    await entrar(alvo.email, 'minha-senha-nova-1').expect(200);
  });

  it('quem está com senha provisória ainda consegue sair', async () => {
    const gestor = await usuarioComSenha('gestor');
    const alvo = await usuarioComSenha();
    const { body } = await redefinir(gestor.cookie, alvo.user.id).expect(200);

    const pessoa = await navegador(alvo.email, body.senhaProvisoria);
    await pessoa.post('/api/logout').expect(204);
    await pessoa.get('/api/me').expect(401);
  });

  it('cada redefinição gera uma senha diferente, e a anterior deixa de valer', async () => {
    const gestor = await usuarioComSenha('gestor');
    const alvo = await usuarioComSenha();

    const primeira = (await redefinir(gestor.cookie, alvo.user.id).expect(200)).body.senhaProvisoria;
    const segunda = (await redefinir(gestor.cookie, alvo.user.id).expect(200)).body.senhaProvisoria;

    expect(primeira).not.toBe(segunda);
    await entrar(alvo.email, primeira).expect(401);
    await entrar(alvo.email, segunda).expect(200);
  });

  it('o gestor não redefine a própria senha por aqui; usuário inexistente e id inválido dão 404', async () => {
    const gestor = await usuarioComSenha('gestor');

    const propria = await redefinir(gestor.cookie, gestor.user.id);
    expect(propria.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: gestor.user.id } })).precisaTrocarSenha).toBe(false);

    await redefinir(gestor.cookie, 999999).expect(404);
    await request(app).post('/api/usuarios/abc/redefinir-senha').set('Cookie', gestor.cookie).expect(404);
  });
});

describe('gerarSenhaProvisoria', () => {
  it('tem 12 caracteres legíveis (sem 0, O, 1, l, I) e não se repete', () => {
    const geradas = new Set<string>();
    for (let i = 0; i < 300; i += 1) {
      const senha = gerarSenhaProvisoria();
      expect(senha).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
      geradas.add(senha);
    }
    expect(geradas.size).toBe(300);
  });
});
