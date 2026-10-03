import request from 'supertest';
import type { Prisma } from '@prisma/client';
import { adicionarDias, hojeNoFuso } from '@stante/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';
import {
  criarDemanda,
  criarDemandante,
  criarFiscal,
  criarUsuarioComSessao,
  data,
  limparBanco,
} from '../../test/fixtures';
import { gerarAlertasDePrazo } from './notificacoes';

const app = createApp();
const em = (dias: number) => adicionarDias(hojeNoFuso(), dias);
const DIA_MS = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await prisma.notificacao.deleteMany();
  await limparBanco();
});
afterAll(() => prisma.$disconnect());

const avisosDe = (userId: number) =>
  prisma.notificacao.findMany({ where: { userId }, orderBy: { id: 'asc' } });

/** Um gestor, um inspetor já vinculado a um fiscal, e um órgão. */
async function cenario() {
  const gestor = await criarUsuarioComSessao('gestor');
  const inspetor = await criarUsuarioComSessao('inspetor');
  const fiscal = await criarFiscal('Fiscal do Inspetor', inspetor.user.id);
  const demandante = await criarDemandante();
  const nova = (dias: number, extras: Partial<Prisma.DemandaUncheckedCreateInput> = {}) =>
    criarDemanda({
      demandanteId: demandante.id,
      fiscalId: fiscal.id,
      assunto: 'Laudo de insalubridade',
      prazo: data(em(dias)),
      ...extras,
    });
  return { gestor, inspetor, fiscal, demandante, nova };
}

describe('alertas de prazo', () => {
  it('prazo crítico avisa só o fiscal (os gestores veem no dashboard)', async () => {
    const { gestor, inspetor, nova } = await cenario();
    await nova(3);

    expect(await gerarAlertasDePrazo()).toBe(1);

    const doInspetor = await avisosDe(inspetor.user.id);
    expect(doInspetor).toHaveLength(1);
    expect(doInspetor[0]).toMatchObject({ tipo: 'prazo_critico', lidaEm: null });
    expect(doInspetor[0]!.mensagem).toMatch(/vence em 3 dias/);
    expect(await avisosDe(gestor.user.id)).toHaveLength(0);
  });

  it('vence hoje tem texto próprio', async () => {
    const { inspetor, nova } = await cenario();
    await nova(0);
    await gerarAlertasDePrazo();
    expect((await avisosDe(inspetor.user.id))[0]!.mensagem).toMatch(/vence hoje/);
  });

  it('prazo vencido avisa o fiscal e todos os gestores', async () => {
    const { gestor, inspetor, nova } = await cenario();
    const outroGestor = await criarUsuarioComSessao('gestor');
    await nova(-2);

    expect(await gerarAlertasDePrazo()).toBe(3);

    for (const usuario of [gestor, outroGestor, inspetor]) {
      const avisos = await avisosDe(usuario.user.id);
      expect(avisos, usuario.user.nome).toHaveLength(1);
      expect(avisos[0]!.tipo).toBe('prazo_vencido');
      expect(avisos[0]!.mensagem).toMatch(/há 2 dias/);
    }
  });

  it('vencida sem fiscal avisa só os gestores; crítica sem fiscal não avisa ninguém', async () => {
    const { gestor, inspetor, nova } = await cenario();
    await nova(-1, { fiscalId: null });
    await nova(2, { fiscalId: null });

    expect(await gerarAlertasDePrazo()).toBe(1);
    expect(await avisosDe(gestor.user.id)).toHaveLength(1);
    expect(await avisosDe(inspetor.user.id)).toHaveLength(0);
  });

  it('é idempotente: rodar de novo não repete o aviso', async () => {
    const { nova } = await cenario();
    await nova(3);
    await nova(-2);

    expect(await gerarAlertasDePrazo()).toBeGreaterThan(0);
    const total = await prisma.notificacao.count();
    expect(await gerarAlertasDePrazo()).toBe(0);
    expect(await prisma.notificacao.count()).toBe(total);
  });

  it('mudar o prazo permite um aviso novo; o antigo continua lá', async () => {
    const { inspetor, nova } = await cenario();
    const demanda = await nova(3);
    await gerarAlertasDePrazo();

    await prisma.demanda.update({ where: { id: demanda.id }, data: { prazo: data(em(2)) } });
    expect(await gerarAlertasDePrazo()).toBe(1);

    const avisos = await avisosDe(inspetor.user.id);
    expect(avisos.map((a) => a.mensagem.match(/em (\d) dias/)?.[1])).toEqual(['3', '2']);
  });

  it('ignora o que não deve alertar', async () => {
    const { nova } = await cenario();
    await nova(3, { status: 'concluida', concluidaEm: new Date() });
    await nova(3, { status: 'em_analise', origem: 'campo' });
    await nova(6); // ainda fora da janela crítica
    await nova(-31); // vencida há tempo demais: o dashboard já a destaca

    expect(await gerarAlertasDePrazo()).toBe(0);
  });

  it('apaga da base os avisos já lidos e antigos, e só esses', async () => {
    const { inspetor } = await cenario();
    const base = { userId: inspetor.user.id, tipo: 'prazo_critico' as const, mensagem: 'x' };
    await prisma.notificacao.createMany({
      data: [
        { ...base, chave: 'lida-antiga', lidaEm: new Date(Date.now() - 61 * DIA_MS) },
        { ...base, chave: 'lida-recente', lidaEm: new Date(Date.now() - 5 * DIA_MS) },
        { ...base, chave: 'nao-lida-antiga', lidaEm: null, createdAt: new Date(Date.now() - 90 * DIA_MS) },
      ],
    });

    await gerarAlertasDePrazo();

    const chaves = (await avisosDe(inspetor.user.id)).map((a) => a.chave).sort();
    expect(chaves).toEqual(['lida-recente', 'nao-lida-antiga']);
  });
});

describe('avisos por evento', () => {
  const post = (cookie: string, caminho: string, corpo: object) =>
    request(app).post(caminho).set('Cookie', cookie).send(corpo);
  const patch = (cookie: string, id: number, corpo: object) =>
    request(app).patch(`/api/demandas/${id}`).set('Cookie', cookie).send(corpo);

  it('demanda aberta em campo avisa os gestores, não o autor', async () => {
    const { gestor, inspetor, demandante } = await cenario();
    const outroGestor = await criarUsuarioComSessao('gestor');

    await post(inspetor.cookie, '/api/demandas', {
      demandanteId: demandante.id, assunto: 'Acidente grave', prazo: em(2),
    }).expect(201);

    for (const g of [gestor, outroGestor]) {
      const avisos = await avisosDe(g.user.id);
      expect(avisos).toHaveLength(1);
      expect(avisos[0]!.tipo).toBe('aguardando_validacao');
      expect(avisos[0]!.mensagem).toContain(`aberta em campo por ${inspetor.user.nome}`);
    }
    expect(await avisosDe(inspetor.user.id)).toHaveLength(0);
  });

  it('validar avisa quem abriu a demanda, e não o gestor que validou', async () => {
    const { gestor, inspetor, demandante } = await cenario();
    const criada = await post(inspetor.cookie, '/api/demandas', {
      demandanteId: demandante.id, assunto: 'Denúncia', prazo: em(10),
    }).expect(201);

    await post(gestor.cookie, `/api/demandas/${criada.body.id}/validar`, {}).expect(200);

    const avisos = await avisosDe(inspetor.user.id);
    expect(avisos.map((a) => a.tipo)).toEqual(['demanda_validada']);
    expect(avisos[0]!.mensagem).toContain('validada pelo gestor');
    expect((await avisosDe(gestor.user.id)).map((a) => a.tipo)).toEqual(['aguardando_validacao']);
  });

  it('atribuir um fiscal avisa o usuário dele; sem mudança, não avisa', async () => {
    const { gestor, inspetor, demandante } = await cenario();
    const outroFiscal = await criarFiscal('Fiscal sem acesso');
    const demanda = await criarDemanda({ demandanteId: demandante.id, fiscalId: outroFiscal.id, assunto: 'x', prazo: data(em(30)) });
    const meuFiscalId = (await prisma.fiscal.findFirstOrThrow({ where: { userId: inspetor.user.id } })).id;

    await patch(gestor.cookie, demanda.id, { fiscalId: meuFiscalId }).expect(200);
    expect((await avisosDe(inspetor.user.id)).map((a) => a.tipo)).toEqual(['demanda_atribuida']);

    // Salvar de novo com o mesmo fiscal não é atribuição nova
    await patch(gestor.cookie, demanda.id, { fiscalId: meuFiscalId, status: 'em_andamento' }).expect(200);
    expect(await avisosDe(inspetor.user.id)).toHaveLength(1);

    // A → B → A: a segunda atribuição ao mesmo fiscal é um aviso legítimo
    await patch(gestor.cookie, demanda.id, { fiscalId: outroFiscal.id }).expect(200);
    await patch(gestor.cookie, demanda.id, { fiscalId: meuFiscalId }).expect(200);
    expect(await avisosDe(inspetor.user.id)).toHaveLength(2);
  });

  it('criar uma demanda já com fiscal avisa o fiscal', async () => {
    const { gestor, inspetor, fiscal, demandante } = await cenario();
    await post(gestor.cookie, '/api/demandas', {
      demandanteId: demandante.id, fiscalId: fiscal.id, assunto: 'Planejada', prazo: em(20),
    }).expect(201);

    expect((await avisosDe(inspetor.user.id)).map((a) => a.tipo)).toEqual(['demanda_atribuida']);
  });

  it('reabrir uma demanda concluída avisa o fiscal, com o motivo', async () => {
    const { gestor, inspetor, nova } = await cenario();
    const demanda = await nova(30, { status: 'concluida', concluidaEm: new Date() });

    await patch(gestor.cookie, demanda.id, { status: 'aberta', motivo: 'Chegou laudo novo' }).expect(200);

    const avisos = await avisosDe(inspetor.user.id);
    expect(avisos.map((a) => a.tipo)).toEqual(['demanda_reaberta']);
    expect(avisos[0]!.mensagem).toContain('Motivo: Chegou laudo novo');
    expect(await avisosDe(gestor.user.id)).toHaveLength(0);
  });

  it('uma ação recusada não deixa aviso nenhum', async () => {
    const { gestor, inspetor, nova } = await cenario();
    const demanda = await nova(30);

    await patch(gestor.cookie, demanda.id, { fiscalId: 999999 }).expect(400);

    expect(await avisosDe(inspetor.user.id)).toHaveLength(0);
  });
});

describe('API de avisos', () => {
  async function criarAviso(userId: number, extras: Partial<Prisma.NotificacaoUncheckedCreateInput> = {}) {
    return prisma.notificacao.create({
      data: { userId, tipo: 'prazo_critico', chave: String(Math.random()), mensagem: 'Aviso de teste', ...extras },
    });
  }

  it('exige login', async () => {
    await request(app).get('/api/notificacoes').expect(401);
    await request(app).post('/api/notificacoes/lidas').expect(401);
    await request(app).post('/api/notificacoes/1/lida').expect(401);
  });

  it('lista só os avisos de quem pergunta, do mais recente ao mais antigo, com o total de não lidos', async () => {
    const eu = await criarUsuarioComSessao('inspetor');
    const outro = await criarUsuarioComSessao('inspetor');
    await criarAviso(eu.user.id, { mensagem: 'primeiro' });
    await criarAviso(eu.user.id, { mensagem: 'segundo', lidaEm: new Date() });
    await criarAviso(eu.user.id, { mensagem: 'terceiro' });
    await criarAviso(outro.user.id, { mensagem: 'de outra pessoa' });

    const res = await request(app).get('/api/notificacoes').set('Cookie', eu.cookie).expect(200);

    expect(res.body.naoLidas).toBe(2);
    expect(res.body.itens.map((i: { mensagem: string }) => i.mensagem)).toEqual(['terceiro', 'segundo', 'primeiro']);
    expect(res.body.itens.map((i: { lida: boolean }) => i.lida)).toEqual([false, true, false]);
  });

  it('respeita o limite pedido e o máximo', async () => {
    const eu = await criarUsuarioComSessao('gestor');
    for (let i = 0; i < 5; i += 1) await criarAviso(eu.user.id);

    const dois = await request(app).get('/api/notificacoes?limite=2').set('Cookie', eu.cookie).expect(200);
    expect(dois.body.itens).toHaveLength(2);
    expect(dois.body.naoLidas).toBe(5); // o total não depende do limite

    const absurdo = await request(app).get('/api/notificacoes?limite=99999').set('Cookie', eu.cookie).expect(200);
    expect(absurdo.body.itens).toHaveLength(5);
  });

  it('marcar um aviso como lido, e marcar de novo continua dando certo', async () => {
    const eu = await criarUsuarioComSessao('gestor');
    const aviso = await criarAviso(eu.user.id);

    await request(app).post(`/api/notificacoes/${aviso.id}/lida`).set('Cookie', eu.cookie).expect(200);
    await request(app).post(`/api/notificacoes/${aviso.id}/lida`).set('Cookie', eu.cookie).expect(200);

    expect((await prisma.notificacao.findUniqueOrThrow({ where: { id: aviso.id } })).lidaEm).not.toBeNull();
    const res = await request(app).get('/api/notificacoes').set('Cookie', eu.cookie).expect(200);
    expect(res.body.naoLidas).toBe(0);
  });

  it('o aviso de outra pessoa (ou inexistente, ou id inválido) responde 404 e não é alterado', async () => {
    const eu = await criarUsuarioComSessao('gestor');
    const outro = await criarUsuarioComSessao('gestor');
    const alheio = await criarAviso(outro.user.id);

    await request(app).post(`/api/notificacoes/${alheio.id}/lida`).set('Cookie', eu.cookie).expect(404);
    await request(app).post('/api/notificacoes/999999/lida').set('Cookie', eu.cookie).expect(404);
    await request(app).post('/api/notificacoes/abc/lida').set('Cookie', eu.cookie).expect(404);
    expect((await prisma.notificacao.findUniqueOrThrow({ where: { id: alheio.id } })).lidaEm).toBeNull();
  });

  it('marcar todos como lidos mexe só nos meus', async () => {
    const eu = await criarUsuarioComSessao('inspetor');
    const outro = await criarUsuarioComSessao('inspetor');
    await criarAviso(eu.user.id);
    await criarAviso(eu.user.id);
    await criarAviso(outro.user.id);

    const res = await request(app).post('/api/notificacoes/lidas').set('Cookie', eu.cookie).expect(200);

    expect(res.body.marcadas).toBe(2);
    expect(await prisma.notificacao.count({ where: { userId: outro.user.id, lidaEm: null } })).toBe(1);
  });

  it('os avisos de uma demanda somem junto com ela', async () => {
    const { inspetor, nova } = await cenario();
    const demanda = await nova(3);
    await gerarAlertasDePrazo();
    expect(await avisosDe(inspetor.user.id)).toHaveLength(1);

    await prisma.demanda.delete({ where: { id: demanda.id } });

    expect(await avisosDe(inspetor.user.id)).toHaveLength(0);
  });
});
