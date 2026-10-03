import request from 'supertest';
import { adicionarDias, hojeNoFuso, ultimosMeses } from '@stante/shared';
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

async function cenario() {
  const sindicato = await criarDemandante('Sindicato', 'sindicato');
  const mpt = await criarDemandante('MPT', 'ministerio_publico');
  const mpe = await criarDemandante('MPE', 'ministerio_publico');
  const inspetor = await criarUsuarioComSessao('inspetor');
  const fiscalA = await criarFiscal('Fiscal A', inspetor.user.id);
  const fiscalB = await criarFiscal('Fiscal B');

  const nova = (demandanteId: number, assunto: string, dias: number, extra = {}) =>
    criarDemanda({ demandanteId, assunto, prazo: data(em(dias)), ...extra });

  await nova(mpt.id, 'vencida', -3, { fiscalId: fiscalA.id });
  await nova(mpt.id, 'critica', 2, { fiscalId: fiscalA.id });
  await nova(mpe.id, 'folga-1', 20, { fiscalId: fiscalB.id });
  await nova(sindicato.id, 'folga-2', 60);
  await nova(sindicato.id, 'concluida', -10, { status: 'concluida', concluidaEm: new Date(), fiscalId: fiscalB.id });
  await nova(sindicato.id, 'em-analise', 5, { status: 'em_analise', origem: 'campo', fiscalId: fiscalA.id });

  return { inspetor, mpt };
}

describe('GET /api/dashboard', () => {
  it('exige login', async () => {
    await request(app).get('/api/dashboard').expect(401);
  });

  it('gestor recebe os indicadores de tudo', async () => {
    await cenario();
    const { cookie } = await criarUsuarioComSessao('gestor');
    const res = await request(app).get('/api/dashboard').set('Cookie', cookie).expect(200);

    expect(res.body).toMatchObject({
      total: 6,
      aguardandoValidacao: 1,
      vencidas: 1,
      prazoCritico: 1,
      emAndamento: 2, // folga-1 e folga-2
      concluidas: 1,
      atribuidas: 3, // vencida, critica, folga-1 (as ativas com fiscal)
    });
  });

  it('agrupa as ativas por categoria do órgão, sem contar concluídas nem em análise', async () => {
    await cenario();
    const { cookie } = await criarUsuarioComSessao('gestor');
    const res = await request(app).get('/api/dashboard').set('Cookie', cookie).expect(200);

    expect(res.body.porDemandante).toEqual([
      { tipo: 'Ministério Público', quantidade: 3 },
      { tipo: 'Sindicatos', quantidade: 1 },
    ]);
  });

  it('mostra a carga dos fiscais só para o gestor', async () => {
    const { inspetor } = await cenario();
    const gestor = await criarUsuarioComSessao('gestor');

    const doGestor = await request(app).get('/api/dashboard').set('Cookie', gestor.cookie).expect(200);
    expect(doGestor.body.cargaFiscais).toEqual([
      { fiscal: 'Fiscal A', quantidade: 2 },
      { fiscal: 'Fiscal B', quantidade: 1 },
    ]);

    const doInspetor = await request(app).get('/api/dashboard').set('Cookie', inspetor.cookie).expect(200);
    expect(doInspetor.body.cargaFiscais).toEqual([]);
  });

  it('lista os próximos prazos em ordem, até 30 dias, só de demandas ativas', async () => {
    await cenario();
    const { cookie } = await criarUsuarioComSessao('gestor');
    const res = await request(app).get('/api/dashboard').set('Cookie', cookie).expect(200);

    expect(res.body.prazosProximos.map((p: { assunto: string }) => p.assunto)).toEqual(['critica', 'folga-1']);
    expect(res.body.prazosProximos[0]).toMatchObject({ dias: 2, demandante: 'MPT' });
    expect(res.body.prazosProximos[0].numero).toMatch(/^DEM-\d{4}$/);
  });

  it('o inspetor vê os indicadores apenas das suas demandas', async () => {
    const { inspetor } = await cenario();
    const res = await request(app).get('/api/dashboard').set('Cookie', inspetor.cookie).expect(200);
    // Fiscal A: vencida, critica e em-analise
    expect(res.body).toMatchObject({ total: 3, vencidas: 1, prazoCritico: 1, aguardandoValidacao: 1, concluidas: 0 });
  });

  it('o representante vê só o órgão dele e nada em análise', async () => {
    const { mpt } = await cenario();
    const { cookie } = await criarUsuarioComSessao('representante', { demandanteId: mpt.id });
    const res = await request(app).get('/api/dashboard').set('Cookie', cookie).expect(200);
    expect(res.body).toMatchObject({ total: 2, vencidas: 1, prazoCritico: 1, aguardandoValidacao: 0 });
  });

  it('a tendência mensal cobre 8 meses e conta recebidas e concluídas no mês atual', async () => {
    await cenario();
    const { cookie } = await criarUsuarioComSessao('gestor');
    const res = await request(app).get('/api/dashboard').set('Cookie', cookie).expect(200);

    const meses = ultimosMeses(hojeNoFuso(), 8);
    expect(res.body.tendenciaMensal).toHaveLength(8);
    expect(res.body.tendenciaMensal.map((m: { mes: string }) => m.mes)).toEqual(meses.map((m) => m.mes));

    const atual = res.body.tendenciaMensal.at(-1);
    expect(atual).toEqual({ mes: meses.at(-1)!.mes, recebidas: 6, concluidas: 1 });
    expect(res.body.tendenciaMensal.slice(0, -1).every((m: { recebidas: number }) => m.recebidas === 0)).toBe(true);
  });

  it('a conclusão é contada no mês de concluidaEm, não no de qualquer edição', async () => {
    const demandante = await criarDemandante();
    const { cookie } = await criarUsuarioComSessao('gestor');
    const meses = ultimosMeses(hojeNoFuso(), 8);
    const umMesAtras = new Date();
    umMesAtras.setUTCDate(15);
    umMesAtras.setUTCMonth(umMesAtras.getUTCMonth() - 2);

    await criarDemanda({
      demandanteId: demandante.id, assunto: 'x', prazo: data(em(30)), status: 'concluida', concluidaEm: umMesAtras,
    });

    const res = await request(app).get('/api/dashboard').set('Cookie', cookie).expect(200);
    const dois = res.body.tendenciaMensal[meses.length - 3];
    expect(dois.concluidas).toBe(1);
    expect(res.body.tendenciaMensal.at(-1).concluidas).toBe(0);
  });
});
