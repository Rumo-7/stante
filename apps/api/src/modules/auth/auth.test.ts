import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { hashSenha } from '../../auth/senha';

const app = createApp();

const CADASTRO = {
  nome: 'Maria Silva',
  email: 'maria@exemplo.com',
  senha: 'senha-segura-123',
  confirmarSenha: 'senha-segura-123',
  perfil: 'inspetor',
};

async function criarUsuario(status: 'pendente' | 'ativo' | 'bloqueado', perfil: 'gestor' | 'inspetor' = 'gestor') {
  return prisma.user.create({
    data: {
      nome: 'Ana',
      email: 'ana@exemplo.com',
      senhaHash: await hashSenha('senha-segura-123'),
      perfil,
      status,
    },
  });
}

beforeEach(async () => {
  await prisma.sessao.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(() => prisma.$disconnect());

describe('POST /api/cadastro', () => {
  it('cria a conta como pendente, ignorando qualquer pedido de acesso imediato', async () => {
    const res = await request(app).post('/api/cadastro').send({ ...CADASTRO, perfil: 'gestor' });
    expect(res.status).toBe(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: CADASTRO.email } });
    expect(user.status).toBe('pendente');
    expect(user.senhaHash).not.toBe(CADASTRO.senha);
  });

  it('normaliza o e-mail para minúsculas', async () => {
    await request(app).post('/api/cadastro').send({ ...CADASTRO, email: '  Maria@Exemplo.COM ' });
    expect(await prisma.user.findUnique({ where: { email: 'maria@exemplo.com' } })).not.toBeNull();
  });

  it.each([
    ['senhas diferentes', { confirmarSenha: 'outra-senha-123' }, 'As senhas não coincidem.'],
    ['senha curta', { senha: 'curta', confirmarSenha: 'curta' }, 'A senha deve ter pelo menos 8 caracteres.'],
    ['perfil inválido', { perfil: 'admin' }, 'Perfil inválido.'],
    ['e-mail inválido', { email: 'nao-e-email' }, 'Informe um e-mail válido.'],
  ])('rejeita %s', async (_nome, alteracao, mensagem) => {
    const res = await request(app).post('/api/cadastro').send({ ...CADASTRO, ...alteracao });
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe(mensagem);
  });

  it('responde 409 para e-mail já cadastrado', async () => {
    await request(app).post('/api/cadastro').send(CADASTRO);
    const res = await request(app).post('/api/cadastro').send(CADASTRO);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/login', () => {
  it('entra com credenciais corretas e grava o cookie de sessão httpOnly', async () => {
    await criarUsuario('ativo');
    const res = await request(app).post('/api/login').send({ email: 'ana@exemplo.com', senha: 'senha-segura-123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ nome: 'Ana', email: 'ana@exemplo.com', perfil: 'gestor' });
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/^stante_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('não grava o token puro no banco', async () => {
    await criarUsuario('ativo');
    const res = await request(app).post('/api/login').send({ email: 'ana@exemplo.com', senha: 'senha-segura-123' });
    const token = /stante_sid=([^;]+)/.exec((res.headers['set-cookie'] as unknown as string[])[0]!)![1]!;
    expect(await prisma.sessao.findUnique({ where: { id: token } })).toBeNull();
    expect(await prisma.sessao.count()).toBe(1);
  });

  it('dá a mesma resposta para senha errada e e-mail inexistente', async () => {
    await criarUsuario('ativo');
    const errada = await request(app).post('/api/login').send({ email: 'ana@exemplo.com', senha: 'errada-errada' });
    const inexistente = await request(app).post('/api/login').send({ email: 'ninguem@exemplo.com', senha: 'senha-segura-123' });
    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(errada.body).toEqual(inexistente.body);
  });

  it('bloqueia conta pendente e conta bloqueada, só depois de confirmar a senha', async () => {
    await criarUsuario('pendente');
    const pendente = await request(app).post('/api/login').send({ email: 'ana@exemplo.com', senha: 'senha-segura-123' });
    expect(pendente.status).toBe(403);
    expect(pendente.headers['set-cookie']).toBeUndefined();

    const senhaErrada = await request(app).post('/api/login').send({ email: 'ana@exemplo.com', senha: 'errada-errada' });
    expect(senhaErrada.status).toBe(401);

    await prisma.user.updateMany({ data: { status: 'bloqueado' } });
    const bloqueada = await request(app).post('/api/login').send({ email: 'ana@exemplo.com', senha: 'senha-segura-123' });
    expect(bloqueada.status).toBe(403);
  });
});

describe('sessão', () => {
  async function logar() {
    await criarUsuario('ativo');
    const agente = request.agent(app);
    await agente.post('/api/login').send({ email: 'ana@exemplo.com', senha: 'senha-segura-123' }).expect(200);
    return agente;
  }

  it('GET /api/me exige login', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/me devolve o usuário logado', async () => {
    const agente = await logar();
    const res = await agente.get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nome: 'Ana', email: 'ana@exemplo.com', perfil: 'gestor' });
    expect(res.body.senhaHash).toBeUndefined();
  });

  it('logout invalida a sessão no servidor', async () => {
    const agente = await logar();
    await agente.post('/api/logout').expect(204);
    expect(await prisma.sessao.count()).toBe(0);
    await agente.get('/api/me').expect(401);
  });

  it('sessão expirada não vale', async () => {
    const agente = await logar();
    await prisma.sessao.updateMany({ data: { expiraEm: new Date(Date.now() - 1000) } });
    await agente.get('/api/me').expect(401);
  });

  it('bloquear a conta derruba a sessão que já estava aberta', async () => {
    const agente = await logar();
    await prisma.user.updateMany({ data: { status: 'bloqueado' } });
    await agente.get('/api/me').expect(401);
  });
});

describe('proteções gerais', () => {
  it('recusa POST com Origin de outro site', async () => {
    const res = await request(app)
      .post('/api/login')
      .set('Origin', 'https://site-malicioso.example')
      .send({ email: 'ana@exemplo.com', senha: 'senha-segura-123' });
    expect(res.status).toBe(403);
  });

  it('aceita POST quando o Origin é o mesmo host da requisição', async () => {
    const res = await request(app)
      .post('/api/login')
      .set('Host', 'stante.exemplo.com')
      .set('Origin', 'https://stante.exemplo.com')
      .send({ email: 'ninguem@exemplo.com', senha: 'qualquer-senha' });
    // Passou pela checagem de origem e chegou à validação de credenciais
    expect(res.status).toBe(401);
  });

  it('rota de API inexistente responde 404 em JSON', async () => {
    const res = await request(app).get('/api/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.erro).toBeDefined();
  });

  it('JSON malformado responde 400, não 500', async () => {
    const res = await request(app).post('/api/login').set('Content-Type', 'application/json').send('{ruim');
    expect(res.status).toBe(400);
  });
});
