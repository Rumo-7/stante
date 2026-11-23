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
