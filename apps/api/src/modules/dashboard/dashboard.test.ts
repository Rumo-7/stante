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

describe('filtros do dashboard', () => {
  const dia = (diasAtras: number) => adicionarDias(hojeNoFuso(), -diasAtras);
  // Instante em horário de Recife (UTC-3, sem horário de verão)
  const instante = (diasAtras: number, hora = '12:00') => new Date(`${dia(diasAtras)}T${hora}:00-03:00`);

  async function cenarioFiltros() {
    const gestor = await criarUsuarioComSessao('gestor');
    const orgaoA = await criarDemandante('Órgão A');
    const orgaoB = await criarDemandante('Órgão B');
    const fiscal1 = await criarFiscal('Fiscal 1');
    const fiscal2 = await criarFiscal('Fiscal 2');
    const nova = (demandanteId: number, fiscalId: number, createdAt: Date, extras = {}) =>
      criarDemanda({ demandanteId, fiscalId, assunto: 'x', prazo: data(em(30)), createdAt, ...extras });

    await nova(orgaoA.id, fiscal1.id, instante(40));
    await nova(orgaoA.id, fiscal2.id, instante(20));
    await nova(orgaoB.id, fiscal1.id, instante(10), { status: 'concluida', concluidaEm: instante(8) });
    await nova(orgaoB.id, fiscal2.id, instante(5, '22:30')); // 22h30 em Recife já é "amanhã" em UTC
    return { gestor, orgaoA, orgaoB, fiscal1, fiscal2 };
  }

  const consultar = (cookie: string, consulta: Record<string, string> = {}) =>
    request(app).get('/api/dashboard').query(consulta).set('Cookie', cookie);

  const totalRecebidoNaTendencia = (corpo: { tendenciaMensal: { recebidas: number }[] }) =>
    corpo.tendenciaMensal.reduce((soma, mes) => soma + mes.recebidas, 0);

  it('sem filtro conta tudo', async () => {
    const { gestor } = await cenarioFiltros();
    const res = await consultar(gestor.cookie).expect(200);
    expect(res.body).toMatchObject({ total: 4, concluidas: 1 });
  });

  it('filtra por fiscal: indicadores, carga e tendência', async () => {
    const { gestor, fiscal1 } = await cenarioFiltros();
    const res = await consultar(gestor.cookie, { fiscalId: String(fiscal1.id) }).expect(200);

    expect(res.body).toMatchObject({ total: 2, concluidas: 1 });
    expect(res.body.cargaFiscais).toEqual([{ fiscal: 'Fiscal 1', quantidade: 1 }]);
    expect(totalRecebidoNaTendencia(res.body)).toBe(2);
  });

  it('filtra por órgão', async () => {
    const { gestor, orgaoB } = await cenarioFiltros();
    const res = await consultar(gestor.cookie, { demandanteId: String(orgaoB.id) }).expect(200);
    expect(res.body.total).toBe(2);
    expect(totalRecebidoNaTendencia(res.body)).toBe(2);
  });

  it('filtra pelo período de cadastro, inclusive nas duas pontas', async () => {
    const { gestor } = await cenarioFiltros();
    const res = await consultar(gestor.cookie, { de: dia(20), ate: dia(5) }).expect(200);
    expect(res.body.total).toBe(3); // as de 20, 10 e 5 dias atrás; a de 40 fica de fora
  });

  it('o período conta o dia de Recife, não o de UTC', async () => {
    const { gestor } = await cenarioFiltros();

    // A demanda foi cadastrada às 22h30 do dia -5 em Recife (01h30 do dia -4 em UTC)
    const nesseDia = await consultar(gestor.cookie, { de: dia(5), ate: dia(5) }).expect(200);
    expect(nesseDia.body.total).toBe(1);

    const diaSeguinte = await consultar(gestor.cookie, { de: dia(4) }).expect(200);
    expect(diaSeguinte.body.total).toBe(0);
  });

  it('o período não afeta a tendência mensal, que é sempre a série dos últimos meses', async () => {
    const { gestor } = await cenarioFiltros();
    const sem = await consultar(gestor.cookie).expect(200);
    const com = await consultar(gestor.cookie, { de: dia(5), ate: dia(5) }).expect(200);

    expect(com.body.tendenciaMensal).toEqual(sem.body.tendenciaMensal);
    expect(totalRecebidoNaTendencia(com.body)).toBe(4);
    expect(com.body.total).toBe(1);
  });

  it('combina os filtros', async () => {
    const { gestor, orgaoB, fiscal2 } = await cenarioFiltros();
    const res = await consultar(gestor.cookie, {
      demandanteId: String(orgaoB.id),
      fiscalId: String(fiscal2.id),
      de: dia(20),
    }).expect(200);
    expect(res.body.total).toBe(1);
  });

  it('o filtro nunca amplia o escopo: o inspetor não vê demandas de outro fiscal por filtrar por ele', async () => {
    const inspetor = await criarUsuarioComSessao('inspetor');
    await criarFiscal('Meu Fiscal', inspetor.user.id);
    const { fiscal1 } = await cenarioFiltros();

    const res = await consultar(inspetor.cookie, { fiscalId: String(fiscal1.id) }).expect(200);
    expect(res.body.total).toBe(0);
  });

  it.each([
    ['data fora do formato', { de: '31/12/2026' }, 'Data inválida (use AAAA-MM-DD).'],
    ['período invertido', { de: '2026-10-10', ate: '2026-10-01' }, 'A data inicial não pode ser depois da final.'],
    ['fiscal inválido', { fiscalId: 'abc' }, 'Fiscal inválido.'],
    ['órgão inválido', { demandanteId: '0' }, 'Órgão inválido.'],
  ])('rejeita %s', async (_nome, consulta, mensagem) => {
    const gestor = await criarUsuarioComSessao('gestor');
    const res = await consultar(gestor.cookie, consulta);
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe(mensagem);
  });

  it('filtros vazios, como os de um formulário em branco, são ignorados', async () => {
    const { gestor } = await cenarioFiltros();
    const res = await consultar(gestor.cookie, { de: '', ate: '', fiscalId: '', demandanteId: '' }).expect(200);
    expect(res.body.total).toBe(4);
  });
});
