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

beforeEach(limparBanco);
afterAll(() => prisma.$disconnect());

const alterar = (cookie: string, id: number, corpo: object) =>
  request(app).patch(`/api/demandas/${id}`).set('Cookie', cookie).send(corpo);

const descricoes = async (cookie: string, id: number) =>
  ((await request(app).get(`/api/demandas/${id}/historico`).set('Cookie', cookie).expect(200)).body as {
    descricao: string;
  }[]).map((e) => e.descricao);

async function demandaDoGestor(extras: Partial<Prisma.DemandaUncheckedCreateInput> = {}) {
  const gestor = await criarUsuarioComSessao('gestor');
  const demandante = await criarDemandante();
  const demanda = await criarDemanda({
    demandanteId: demandante.id,
    assunto: 'Relatório técnico de inspeção',
    prazo: data(em(30)),
    ...extras,
  });
  return { gestor, demandante, demanda };
}

describe('bloqueio de retorno sem justificativa', () => {
  it('recusa em_andamento -> aberta sem justificativa, vazia ou só com espaços e não altera nada', async () => {
    const { gestor, demanda } = await demandaDoGestor({ status: 'em_andamento' });

    for (const corpo of [
      { status: 'aberta' },
      { status: 'aberta', justificativa: '' },
      { status: 'aberta', justificativa: '   ' },
    ]) {
      const res = await alterar(gestor.cookie, demanda.id, corpo);
      expect(res.status).toBe(400);
      expect(res.body.erro).toBe('Campo obrigatório');
    }

    const noBanco = await prisma.demanda.findUniqueOrThrow({ where: { id: demanda.id } });
    expect(noBanco.status).toBe('em_andamento');
    expect(await descricoes(gestor.cookie, demanda.id)).toEqual([]);
  });
});
