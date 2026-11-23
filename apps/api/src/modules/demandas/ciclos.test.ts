import request from 'supertest';
import type { Prisma } from '@prisma/client';
import { adicionarDias, hojeNoFuso, numeroDemanda } from '@stante/shared';
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

beforeEach(limparBanco);
afterAll(() => prisma.$disconnect());

const novoCiclo = (cookie: string, id: number, corpo: object) =>
  request(app).post(`/api/demandas/${id}/novo-ciclo`).set('Cookie', cookie).send(corpo);

/** Um caso encerrado: demanda concluída, com fiscal e um gestor pronto para agir. */
async function casoEncerrado(extras: Partial<Prisma.DemandaUncheckedCreateInput> = {}) {
  const gestor = await criarUsuarioComSessao('gestor');
  const demandante = await criarDemandante();
  const fiscal = await criarFiscal('Fiscal Original');
  const original = await criarDemanda({
    demandanteId: demandante.id,
    fiscalId: fiscal.id,
    assunto: 'Denúncia de irregularidade',
    prazo: data(em(-10)),
    status: 'concluida',
    concluidaEm: new Date(),
    ...extras,
  });
  return { gestor, demandante, fiscal, original };
}

describe('POST /api/demandas/:id/novo-ciclo', () => {
  it('gestor abre um novo ciclo de uma demanda concluída', async () => {
    const { gestor, demandante, fiscal, original } = await casoEncerrado();

    const res = await novoCiclo(gestor.cookie, original.id, { motivo: 'Nova denúncia sobre o mesmo caso' }).expect(
      201,
    );

    expect(res.body).toMatchObject({
      demandaOrigemId: original.id,
      numeroOrigem: numeroDemanda(original.id),
      statusSalvo: 'aberta',
      origem: 'planejada',
      demandanteId: demandante.id,
      fiscalId: fiscal.id,
      assunto: 'Denúncia de irregularidade',
    });
    expect(res.body.id).not.toBe(original.id);

    const nova = await prisma.demanda.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(nova.criadaPorId).toBe(gestor.user.id);

    // A original continua como estava: concluída e sem vínculo
    const depois = await prisma.demanda.findUniqueOrThrow({ where: { id: original.id } });
    expect(depois.status).toBe('concluida');
    expect(depois.demandaOrigemId).toBeNull();
  });

  it('usa assunto, fiscal e prazo informados no lugar dos herdados', async () => {
    const { gestor, demandante, original } = await casoEncerrado();
    const outroFiscal = await criarFiscal('Outro Fiscal');

    const res = await novoCiclo(gestor.cookie, original.id, {
      motivo: 'Reincidência',
      assunto: 'Assunto do novo ciclo',
      fiscalId: outroFiscal.id,
      prazo: em(15),
    }).expect(201);

    expect(res.body).toMatchObject({
      demandanteId: demandante.id,
      assunto: 'Assunto do novo ciclo',
      fiscalId: outroFiscal.id,
      prazo: em(15),
    });
  });

  it('sem motivo ou com motivo curto responde 400 e não cria nada', async () => {
    const { gestor, original } = await casoEncerrado();

    for (const corpo of [{}, { motivo: '' }, { motivo: 'ab' }, { motivo: '   ' }]) {
      const res = await novoCiclo(gestor.cookie, original.id, corpo).expect(400);
      expect(res.body.erro).toBe('Campo obrigatório: informe o motivo do novo ciclo.');
    }
    expect(await prisma.demanda.count()).toBe(1);
  });

  it('demanda não concluída responde 409 e não cria nada', async () => {
    const { gestor, original } = await casoEncerrado({ status: 'em_andamento', concluidaEm: null });

    const res = await novoCiclo(gestor.cookie, original.id, { motivo: 'Reincidência' }).expect(409);

    expect(res.body.erro).toBe('Só uma demanda concluída pode ganhar um novo ciclo.');
    expect(await prisma.demanda.count()).toBe(1);
    expect(await prisma.historicoDemanda.count()).toBe(0);
  });

  it('demanda inexistente responde 404', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    await novoCiclo(gestor.cookie, 999_999, { motivo: 'Reincidência' }).expect(404);
  });

  it('inspetor e representante recebem 403', async () => {
    const { demandante, original } = await casoEncerrado();
    const inspetor = await criarUsuarioComSessao('inspetor');
    await prisma.fiscal.update({ where: { id: original.fiscalId! }, data: { userId: inspetor.user.id } });
    const representante = await criarUsuarioComSessao('representante', { demandanteId: demandante.id });

    await novoCiclo(inspetor.cookie, original.id, { motivo: 'Reincidência' }).expect(403);
    await novoCiclo(representante.cookie, original.id, { motivo: 'Reincidência' }).expect(403);
    expect(await prisma.demanda.count()).toBe(1);
  });
});

describe('histórico, raiz e notificação do novo ciclo', () => {
  const historico = async (cookie: string, id: number) =>
    (await request(app).get(`/api/demandas/${id}/historico`).set('Cookie', cookie).expect(200)).body as {
      tipo: string;
      descricao: string;
    }[];

  it('registra novo_ciclo na nova e ciclo_vinculado na raiz, sem apagar o histórico anterior', async () => {
    const { gestor, original } = await casoEncerrado();
    // O histórico que a original já tinha antes do novo ciclo
    await prisma.historicoDemanda.createMany({
      data: [
        { demandaId: original.id, autorId: gestor.user.id, tipo: 'criada', dados: { origem: 'planejada' } },
        {
          demandaId: original.id,
          autorId: gestor.user.id,
          tipo: 'status_alterado',
          dados: { de: 'aberta', para: 'concluida' },
        },
      ],
    });

    const res = await novoCiclo(gestor.cookie, original.id, { motivo: 'Nova denúncia' }).expect(201);
    const nova = res.body.id as number;

    expect(await historico(gestor.cookie, nova)).toEqual([
      expect.objectContaining({
        tipo: 'novo_ciclo',
        descricao: `Novo ciclo aberto a partir de ${numeroDemanda(original.id)}. Motivo: Nova denúncia`,
      }),
    ]);

    const daRaiz = await historico(gestor.cookie, original.id);
    expect(daRaiz.map((e) => e.tipo)).toEqual(['ciclo_vinculado', 'status_alterado', 'criada']);
    expect(daRaiz[0]?.descricao).toBe(`Novo ciclo vinculado: ${numeroDemanda(nova)}. Motivo: Nova denúncia`);
  });

  it('um ciclo aberto a partir de outro ciclo aponta para a raiz', async () => {
    const { gestor, original } = await casoEncerrado();
    const primeiro = (await novoCiclo(gestor.cookie, original.id, { motivo: 'Primeira reincidência' }).expect(201))
      .body.id as number;
    await prisma.demanda.update({ where: { id: primeiro }, data: { status: 'concluida', concluidaEm: new Date() } });

    const segundo = await novoCiclo(gestor.cookie, primeiro, { motivo: 'Segunda reincidência' }).expect(201);

    expect(segundo.body).toMatchObject({ demandaOrigemId: original.id, numeroOrigem: numeroDemanda(original.id) });
    // O vínculo fica registrado na raiz, não no ciclo intermediário
    expect((await historico(gestor.cookie, original.id)).filter((e) => e.tipo === 'ciclo_vinculado')).toHaveLength(2);
    expect((await historico(gestor.cookie, primeiro)).map((e) => e.tipo)).toEqual(['novo_ciclo']);
  });

  it('o fiscal herdado recebe a notificação de atribuição', async () => {
    const inspetor = await criarUsuarioComSessao('inspetor');
    const { gestor, fiscal, original } = await casoEncerrado();
    await prisma.fiscal.update({ where: { id: fiscal.id }, data: { userId: inspetor.user.id } });

    const res = await novoCiclo(gestor.cookie, original.id, { motivo: 'Reincidência' }).expect(201);

    const avisos = await prisma.notificacao.findMany({ where: { userId: inspetor.user.id } });
    expect(avisos).toEqual([expect.objectContaining({ tipo: 'demanda_atribuida', demandaId: res.body.id })]);
  });

  it('sem fiscal (null explícito) o novo ciclo fica sem fiscal e ninguém é notificado', async () => {
    const { gestor, original } = await casoEncerrado();

    const res = await novoCiclo(gestor.cookie, original.id, { motivo: 'Reincidência', fiscalId: null }).expect(201);

    expect(res.body.fiscalId).toBeNull();
    expect(await prisma.notificacao.count()).toBe(0);
  });
});

describe('GET /api/demandas/:id/ciclos', () => {
  const ciclos = (cookie: string, id: number) =>
    request(app).get(`/api/demandas/${id}/ciclos`).set('Cookie', cookie);

  /** Raiz concluída com dois ciclos: o primeiro herda o fiscal, o segundo vai para outro fiscal. */
  async function casoComCiclos() {
    const caso = await casoEncerrado();
    const outroFiscal = await criarFiscal('Outro Fiscal');
    const primeiro = (await novoCiclo(caso.gestor.cookie, caso.original.id, { motivo: 'Reincidência 1' }).expect(201))
      .body.id as number;
    const segundo = (
      await novoCiclo(caso.gestor.cookie, caso.original.id, { motivo: 'Reincidência 2', fiscalId: outroFiscal.id }).expect(
        201,
      )
    ).body.id as number;
    return { ...caso, outroFiscal, primeiro, segundo };
  }

  it('gestor vê a raiz e todos os ciclos, a partir de qualquer um deles, em ordem', async () => {
    const { gestor, original, primeiro, segundo } = await casoComCiclos();

    for (const id of [original.id, primeiro, segundo]) {
      const res = await ciclos(gestor.cookie, id).expect(200);
      expect(res.body.map((c: { id: number }) => c.id)).toEqual([original.id, primeiro, segundo]);
    }
    const res = await ciclos(gestor.cookie, original.id).expect(200);
    expect(res.body[0]).toMatchObject({ id: original.id, numero: numeroDemanda(original.id), status: 'concluida' });
    expect(res.body[1]).toMatchObject({ status: 'aberta' });
    expect(typeof res.body[1].criadoEm).toBe('string');
  });

  it('demanda sem ciclos devolve só ela mesma', async () => {
    const { gestor, original } = await casoEncerrado();
    const res = await ciclos(gestor.cookie, original.id).expect(200);
    expect(res.body.map((c: { id: number }) => c.id)).toEqual([original.id]);
  });

  it('inspetor de outro fiscal recebe 404; o do fiscal só vê os ciclos dele', async () => {
    const { original, outroFiscal, fiscal, primeiro, segundo } = await casoComCiclos();
    const estranho = await criarUsuarioComSessao('inspetor');
    await criarFiscal('Fiscal Sem Relação', estranho.user.id);
    const doOutro = await criarUsuarioComSessao('inspetor');
    await prisma.fiscal.update({ where: { id: outroFiscal.id }, data: { userId: doOutro.user.id } });
    const doOriginal = await criarUsuarioComSessao('inspetor');
    await prisma.fiscal.update({ where: { id: fiscal.id }, data: { userId: doOriginal.user.id } });

    await ciclos(estranho.cookie, original.id).expect(404);
    await ciclos(doOutro.cookie, original.id).expect(404);

    const doSegundo = await ciclos(doOutro.cookie, segundo).expect(200);
    expect(doSegundo.body.map((c: { id: number }) => c.id)).toEqual([segundo]);

    const daRaiz = await ciclos(doOriginal.cookie, original.id).expect(200);
    expect(daRaiz.body.map((c: { id: number }) => c.id)).toEqual([original.id, primeiro]);
  });

  it('representante vê os ciclos do seu órgão e recebe 404 nos de outro órgão', async () => {
    const { demandante, original, primeiro, segundo } = await casoComCiclos();
    const representante = await criarUsuarioComSessao('representante', { demandanteId: demandante.id });
    const outroOrgao = await criarDemandante();
    const deFora = await criarUsuarioComSessao('representante', { demandanteId: outroOrgao.id });

    const res = await ciclos(representante.cookie, primeiro).expect(200);
    expect(res.body.map((c: { id: number }) => c.id)).toEqual([original.id, primeiro, segundo]);
    await ciclos(deFora.cookie, original.id).expect(404);
  });

  it('id inválido responde 404', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    await ciclos(gestor.cookie, 999_999).expect(404);
    await request(app).get('/api/demandas/abc/ciclos').set('Cookie', gestor.cookie).expect(404);
  });
});
