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

describe('retorno com justificativa, avanço e reabertura', () => {
  it('gestor retorna com justificativa e registra o texto esperado no histórico', async () => {
    const { gestor, demanda } = await demandaDoGestor({ status: 'em_andamento' });

    const res = await alterar(gestor.cookie, demanda.id, {
      status: 'aberta',
      justificativa: '  Relatório técnico precisa de ajustes antes da validação final  ',
    }).expect(200);

    expect(res.body.statusSalvo).toBe('aberta');
    expect(await descricoes(gestor.cookie, demanda.id)).toEqual([
      'Etapa retornada de Em andamento para Aberta. Justificativa: Relatório técnico precisa de ajustes antes da validação final',
    ]);
  });

  it('inspetor dono da demanda também consegue retornar com justificativa', async () => {
    const inspetor = await criarUsuarioComSessao('inspetor');
    const fiscal = await criarFiscal('Inspetor Dono', inspetor.user.id);
    const { demanda } = await demandaDoGestor({ status: 'em_andamento', fiscalId: fiscal.id });

    const res = await alterar(inspetor.cookie, demanda.id, {
      status: 'aberta',
      justificativa: 'Necessário revisar vistoria em campo',
    }).expect(200);

    expect(res.body.statusSalvo).toBe('aberta');
    expect(await descricoes(inspetor.cookie, demanda.id)).toEqual([
      'Etapa retornada de Em andamento para Aberta. Justificativa: Necessário revisar vistoria em campo',
    ]);
  });

  it('avançar aberta -> em_andamento não exige justificativa e ignora se enviada', async () => {
    const { gestor, demanda } = await demandaDoGestor({ status: 'aberta' });

    await alterar(gestor.cookie, demanda.id, {
      status: 'em_andamento',
      justificativa: 'Justificativa indevida em avanço',
    }).expect(200);

    expect(await descricoes(gestor.cookie, demanda.id)).toEqual([
      'Status alterado de Aberta para Em andamento',
    ]);
  });

  it('reabertura a partir de concluída continua exigindo motivo e só gestor, sem pedir justificativa', async () => {
    const inspetor = await criarUsuarioComSessao('inspetor');
    const fiscal = await criarFiscal('Meu Fiscal', inspetor.user.id);
    const { gestor, demanda } = await demandaDoGestor({
      status: 'concluida',
      concluidaEm: new Date(),
      fiscalId: fiscal.id,
    });

    // Inspetor não pode reabrir
    const tentativaInspetor = await alterar(inspetor.cookie, demanda.id, {
      status: 'aberta',
      motivo: 'Tentativa do inspetor',
    });
    expect(tentativaInspetor.status).toBe(403);

    // Gestor sem motivo recebe erro de reabertura, não de justificativa
    const semMotivo = await alterar(gestor.cookie, demanda.id, { status: 'aberta' });
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.body.erro).toBe('Informe o motivo da reabertura.');

    // Gestor com motivo reabre sem precisar de justificativa
    await alterar(gestor.cookie, demanda.id, {
      status: 'aberta',
      motivo: 'Chegou novo documento complementar',
    }).expect(200);

    expect(await descricoes(gestor.cookie, demanda.id)).toEqual([
      'Demanda reaberta (Aberta). Motivo: Chegou novo documento complementar',
    ]);
  });
});
