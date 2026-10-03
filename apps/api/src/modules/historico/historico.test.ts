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

const app = createApp();
const em = (dias: number) => adicionarDias(hojeNoFuso(), dias);
const PDF = Buffer.from('%PDF-1.4\nconteudo\n%%EOF');

beforeEach(limparBanco);
afterAll(() => prisma.$disconnect());

const historico = (cookie: string, id: number) =>
  request(app).get(`/api/demandas/${id}/historico`).set('Cookie', cookie);

/** Descrições do histórico, da mais recente para a mais antiga. */
const descricoes = async (cookie: string, id: number) =>
  ((await historico(cookie, id).expect(200)).body as { descricao: string }[]).map((e) => e.descricao);

const alterar = (cookie: string, id: number, corpo: object) =>
  request(app).patch(`/api/demandas/${id}`).set('Cookie', cookie).send(corpo);

async function demandaDoGestor(extras: Partial<Prisma.DemandaUncheckedCreateInput> = {}) {
  const gestor = await criarUsuarioComSessao('gestor');
  const demandante = await criarDemandante();
  const demanda = await criarDemanda({
    demandanteId: demandante.id,
    assunto: 'Assunto original',
    prazo: data(em(30)),
    ...extras,
  });
  return { gestor, demandante, demanda };
}

describe('registro na criação', () => {
  it('gestor cria: fica registrado, com o autor', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();
    const res = await request(app)
      .post('/api/demandas')
      .set('Cookie', gestor.cookie)
      .send({ demandanteId: demandante.id, assunto: 'Nova', prazo: em(30) })
      .expect(201);

    const eventos = (await historico(gestor.cookie, res.body.id).expect(200)).body;
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: 'criada', descricao: 'Demanda criada', autor: gestor.user.nome });
    expect(new Date(eventos[0].criadoEm).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('criar com anexos registra cada arquivo', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();
    const res = await request(app)
      .post('/api/demandas')
      .set('Cookie', gestor.cookie)
      .field('demandanteId', String(demandante.id))
      .field('assunto', 'Com anexos')
      .field('prazo', em(30))
      .attach('anexos', PDF, 'a.pdf')
      .attach('anexos', PDF, 'b.pdf')
      .expect(201);

    expect(await descricoes(gestor.cookie, res.body.id)).toEqual([
      'Anexo adicionado: b.pdf',
      'Anexo adicionado: a.pdf',
      'Demanda criada',
    ]);
  });

  it('demanda aberta em campo diz que aguarda validação', async () => {
    const inspetor = await criarUsuarioComSessao('inspetor');
    await criarFiscal('Meu', inspetor.user.id);
    const demandante = await criarDemandante();
    const res = await request(app)
      .post('/api/demandas')
      .set('Cookie', inspetor.cookie)
      .send({ demandanteId: demandante.id, assunto: 'Denúncia', prazo: em(3) })
      .expect(201);

    expect(await descricoes(inspetor.cookie, res.body.id)).toEqual([
      'Demanda aberta em campo (aguardando validação do gestor)',
    ]);
  });
});

describe('registro das alterações', () => {
  it('status e fiscal viram um evento cada, com antes e depois', async () => {
    const { gestor, demanda } = await demandaDoGestor();
    const fiscal = await criarFiscal('Carla Fiscal');

    await alterar(gestor.cookie, demanda.id, { status: 'em_andamento', fiscalId: fiscal.id }).expect(200);

    expect(await descricoes(gestor.cookie, demanda.id)).toEqual([
      'Fiscal atribuído: Carla Fiscal',
      'Status alterado de Aberta para Em andamento',
    ]);
  });

  it('trocar e remover o fiscal têm textos próprios', async () => {
    const primeiro = await criarFiscal('Primeiro');
    const segundo = await criarFiscal('Segundo');
    const { gestor, demanda } = await demandaDoGestor({ fiscalId: primeiro.id });

    await alterar(gestor.cookie, demanda.id, { fiscalId: segundo.id }).expect(200);
    await alterar(gestor.cookie, demanda.id, { fiscalId: null }).expect(200);

    expect(await descricoes(gestor.cookie, demanda.id)).toEqual([
      'Fiscal removido (era Segundo)',
      'Fiscal alterado de Primeiro para Segundo',
    ]);
  });

  it('prazo e assunto também são registrados', async () => {
    const { gestor, demanda } = await demandaDoGestor();
    const novoPrazo = em(45);

    await alterar(gestor.cookie, demanda.id, { prazo: novoPrazo, assunto: 'Assunto corrigido' }).expect(200);

    const [d, m, a] = [novoPrazo.slice(8, 10), novoPrazo.slice(5, 7), novoPrazo.slice(0, 4)];
    const original = em(30);
    expect(await descricoes(gestor.cookie, demanda.id)).toEqual([
      'Assunto alterado',
      `Prazo alterado de ${original.slice(8, 10)}/${original.slice(5, 7)}/${original.slice(0, 4)} para ${d}/${m}/${a}`,
    ]);
  });

  it('salvar sem mudar nada de verdade não registra nada', async () => {
    const fiscal = await criarFiscal('Mesmo Fiscal');
    const { gestor, demanda } = await demandaDoGestor({ fiscalId: fiscal.id });

    await alterar(gestor.cookie, demanda.id, {
      status: 'aberta',
      fiscalId: fiscal.id,
      assunto: 'Assunto original',
      prazo: em(30),
    }).expect(200);

    expect(await descricoes(gestor.cookie, demanda.id)).toEqual([]);
  });

  it('alteração recusada (fiscal inexistente) não muda a demanda nem registra', async () => {
    const { gestor, demanda } = await demandaDoGestor();

    await alterar(gestor.cookie, demanda.id, { status: 'concluida', fiscalId: 999999 }).expect(400);

    expect(await descricoes(gestor.cookie, demanda.id)).toEqual([]);
    expect((await prisma.demanda.findUniqueOrThrow({ where: { id: demanda.id } })).status).toBe('aberta');
  });

  it('o inspetor registra a conclusão da própria demanda', async () => {
    const inspetor = await criarUsuarioComSessao('inspetor');
    const fiscal = await criarFiscal('Meu', inspetor.user.id);
    const { demanda } = await demandaDoGestor({ fiscalId: fiscal.id });

    await alterar(inspetor.cookie, demanda.id, { status: 'concluida' }).expect(200);

    const eventos = (await historico(inspetor.cookie, demanda.id).expect(200)).body;
    expect(eventos[0]).toMatchObject({
      descricao: 'Status alterado de Aberta para Concluída',
      autor: inspetor.user.nome,
    });
  });
});

describe('registro da validação', () => {
  async function demandaEmAnalise() {
    const inspetor = await criarUsuarioComSessao('inspetor');
    const fiscal = await criarFiscal('Do Campo', inspetor.user.id);
    const gestor = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();
    const demanda = await criarDemanda({
      demandanteId: demandante.id, fiscalId: fiscal.id, assunto: 'Denúncia', prazo: data(em(3)),
      status: 'em_analise', origem: 'campo',
    });
    return { gestor, fiscal, demanda };
  }

  it('validar registra a validação e os ajustes feitos junto', async () => {
    const { gestor, demanda } = await demandaEmAnalise();
    const outro = await criarFiscal('Outro Fiscal');

    await request(app)
      .post(`/api/demandas/${demanda.id}/validar`)
      .set('Cookie', gestor.cookie)
      .send({ fiscalId: outro.id, prazo: em(10) })
      .expect(200);

    const lista = await descricoes(gestor.cookie, demanda.id);
    expect(lista).toHaveLength(3);
    expect(lista[2]).toBe('Demanda validada pelo gestor');
    expect(lista[1]).toBe('Fiscal alterado de Do Campo para Outro Fiscal');
    expect(lista[0]).toMatch(/^Prazo alterado de /);
  });

  it('validar sem ajustes registra só a validação, e validar de novo (409) não duplica', async () => {
    const { gestor, demanda } = await demandaEmAnalise();
    const validar = () => request(app).post(`/api/demandas/${demanda.id}/validar`).set('Cookie', gestor.cookie).send({});

    await validar().expect(200);
    await validar().expect(409);

    expect(await descricoes(gestor.cookie, demanda.id)).toEqual(['Demanda validada pelo gestor']);
  });
});

describe('registro dos anexos', () => {
  it('enviar e remover anexo ficam no histórico', async () => {
    const { gestor, demanda } = await demandaDoGestor();

    const enviado = await request(app)
      .post(`/api/demandas/${demanda.id}/anexos`)
      .set('Cookie', gestor.cookie)
      .attach('anexos', PDF, 'laudo.pdf')
      .expect(201);
    await request(app).delete(`/api/anexos/${enviado.body[0].id}`).set('Cookie', gestor.cookie).expect(200);

    expect(await descricoes(gestor.cookie, demanda.id)).toEqual([
      'Anexo removido: laudo.pdf',
      'Anexo adicionado: laudo.pdf',
    ]);
  });
});

describe('reabertura de demanda concluída', () => {
  async function demandaConcluida() {
    const { gestor, demanda } = await demandaDoGestor();
    await alterar(gestor.cookie, demanda.id, { status: 'concluida' }).expect(200);
    return { gestor, demanda };
  }

  it('o gestor reabre com motivo: vale como reabertura, mantém o histórico e limpa a conclusão', async () => {
    const { gestor, demanda } = await demandaConcluida();

    const res = await alterar(gestor.cookie, demanda.id, {
      status: 'em_andamento',
      motivo: 'Chegou um laudo complementar',
    }).expect(200);
    expect(res.body.statusSalvo).toBe('em_andamento');

    expect(await descricoes(gestor.cookie, demanda.id)).toEqual([
      'Demanda reaberta (Em andamento). Motivo: Chegou um laudo complementar',
      'Status alterado de Aberta para Concluída', // o que veio antes continua lá
    ]);
    expect((await prisma.demanda.findUniqueOrThrow({ where: { id: demanda.id } })).concluidaEm).toBeNull();
  });

  it('sem motivo (ou com motivo curto demais) a reabertura é recusada e nada muda', async () => {
    const { gestor, demanda } = await demandaConcluida();

    const semMotivo = await alterar(gestor.cookie, demanda.id, { status: 'aberta' });
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.body.erro).toBe('Informe o motivo da reabertura.');
    await alterar(gestor.cookie, demanda.id, { status: 'aberta', motivo: 'ok' }).expect(400);

    expect((await prisma.demanda.findUniqueOrThrow({ where: { id: demanda.id } })).status).toBe('concluida');
    expect(await descricoes(gestor.cookie, demanda.id)).toHaveLength(1);
  });

  it('o inspetor não reabre, mesmo sendo o fiscal da demanda', async () => {
    const inspetor = await criarUsuarioComSessao('inspetor');
    const fiscal = await criarFiscal('Meu', inspetor.user.id);
    const demandante = await criarDemandante();
    const demanda = await criarDemanda({
      demandanteId: demandante.id, fiscalId: fiscal.id, assunto: 'x', prazo: data(em(30)),
      status: 'concluida', concluidaEm: new Date(),
    });

    const res = await alterar(inspetor.cookie, demanda.id, { status: 'aberta', motivo: 'Quero reabrir' });
    expect(res.status).toBe(403);
    expect(res.body.erro).toBe('Só o gestor pode reabrir uma demanda concluída.');
    expect((await prisma.demanda.findUniqueOrThrow({ where: { id: demanda.id } })).status).toBe('concluida');
  });

  it('concluir de novo uma já concluída não é reabertura e não exige motivo', async () => {
    const { gestor, demanda } = await demandaConcluida();
    await alterar(gestor.cookie, demanda.id, { status: 'concluida' }).expect(200);
    expect(await descricoes(gestor.cookie, demanda.id)).toHaveLength(1);
  });

  it('o motivo sozinho, sem alteração, é "nada para atualizar"', async () => {
    const { gestor, demanda } = await demandaDoGestor();
    const res = await alterar(gestor.cookie, demanda.id, { motivo: 'só um comentário' });
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Nada para atualizar.');
  });
});

describe('quem pode ler o histórico', () => {
  it('exige login', async () => {
    const { demanda } = await demandaDoGestor();
    await request(app).get(`/api/demandas/${demanda.id}/historico`).expect(401);
  });

  it('o representante do órgão não vê o histórico interno', async () => {
    const { demandante, demanda } = await demandaDoGestor();
    const representante = await criarUsuarioComSessao('representante', { demandanteId: demandante.id });
    await historico(representante.cookie, demanda.id).expect(403);
  });

  it('o inspetor lê o das suas demandas, mas não o das de outro fiscal (404)', async () => {
    const inspetor = await criarUsuarioComSessao('inspetor');
    const meuFiscal = await criarFiscal('Meu', inspetor.user.id);
    const outro = await criarFiscal('Outro');
    const { demanda: minha } = await demandaDoGestor({ fiscalId: meuFiscal.id });
    const { demanda: alheia } = await demandaDoGestor({ fiscalId: outro.id });

    await historico(inspetor.cookie, minha.id).expect(200);
    await historico(inspetor.cookie, alheia.id).expect(404);
  });

  it('demanda inexistente ou id inválido responde 404', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    await historico(gestor.cookie, 999999).expect(404);
    await request(app).get('/api/demandas/abc/historico').set('Cookie', gestor.cookie).expect(404);
  });
});

describe('integridade do registro', () => {
  it('se o autor é removido, o evento continua, sem nome', async () => {
    const { gestor, demanda } = await demandaDoGestor();
    const outroGestor = await criarUsuarioComSessao('gestor');
    await alterar(gestor.cookie, demanda.id, { status: 'em_andamento' }).expect(200);

    await prisma.user.delete({ where: { id: gestor.user.id } });

    const eventos = (await historico(outroGestor.cookie, demanda.id).expect(200)).body;
    expect(eventos).toHaveLength(1);
    expect(eventos[0].autor).toBeNull();
  });

  it('o histórico some junto com a demanda', async () => {
    const { gestor, demanda } = await demandaDoGestor();
    await alterar(gestor.cookie, demanda.id, { status: 'em_andamento' }).expect(200);
    expect(await prisma.historicoDemanda.count({ where: { demandaId: demanda.id } })).toBe(1);

    await prisma.demanda.delete({ where: { id: demanda.id } });
    expect(await prisma.historicoDemanda.count({ where: { demandaId: demanda.id } })).toBe(0);
  });
});
