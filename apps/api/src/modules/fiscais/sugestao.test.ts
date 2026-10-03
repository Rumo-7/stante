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
import { calcularPontos, resumir, sugerirFiscais } from './sugestao';

const app = createApp();
const em = (dias: number) => adicionarDias(hojeNoFuso(), dias);

beforeEach(limparBanco);
afterAll(() => prisma.$disconnect());

async function comOrgao() {
  const orgao = await criarDemandante('Órgão da Demanda');
  const demanda = (fiscalId: number, dias: number, extras: Partial<Prisma.DemandaUncheckedCreateInput> = {}) =>
    criarDemanda({ demandanteId: orgao.id, fiscalId, assunto: 'x', prazo: data(em(dias)), ...extras });
  return { orgao, demanda };
}

const nomes = (lista: { nome: string }[]) => lista.map((s) => s.nome);

describe('cálculo', () => {
  it('cada demanda ativa pesa 2, o risco soma 3, e ter atendido o órgão tira só 1', () => {
    expect(calcularPontos(0, 0, 0)).toBe(0);
    expect(calcularPontos(2, 0, 0)).toBe(4);
    expect(calcularPontos(1, 1, 0)).toBe(5);
    expect(calcularPontos(1, 0, 5)).toBe(1); // o bônus não cresce com a quantidade
    // Uma demanda a mais sempre pesa mais que a afinidade: ela só desempata cargas iguais
    expect(calcularPontos(1, 0, 1)).toBeGreaterThan(calcularPontos(0, 0, 0));
  });

  it('o resumo explica em português', () => {
    expect(resumir(0, 0, 0)).toBe('sem demandas ativas');
    expect(resumir(1, 0, 0)).toBe('1 demanda ativa');
    expect(resumir(3, 2, 1)).toBe('3 demandas ativas · 2 com prazo crítico ou vencido · já atendeu este órgão');
  });
});

describe('ranking', () => {
  it('quem tem menos demandas ativas vem primeiro, e só o primeiro é o sugerido', async () => {
    const { demanda } = await comOrgao();
    const carregado = await criarFiscal('Carregado');
    const medio = await criarFiscal('Médio');
    const livre = await criarFiscal('Livre');
    await demanda(carregado.id, 30);
    await demanda(carregado.id, 40);
    await demanda(medio.id, 30);

    const lista = await sugerirFiscais();

    expect(nomes(lista)).toEqual(['Livre', 'Médio', 'Carregado']);
    expect(lista.map((s) => s.sugerido)).toEqual([true, false, false]);
    expect(lista[0]).toMatchObject({ fiscalId: livre.id, ativas: 0, resumo: 'sem demandas ativas' });
    expect(lista[2]).toMatchObject({ ativas: 2, resumo: '2 demandas ativas' });
  });

  it('prazo crítico ou vencido pesa mais que uma demanda tranquila', async () => {
    const { demanda } = await comOrgao();
    const emRisco = await criarFiscal('Com uma vencida'); // 1 ativa + risco = 5 pontos
    const tranquilo = await criarFiscal('Com duas folgadas'); // 2 ativas = 4 pontos
    await demanda(emRisco.id, -3);
    await demanda(tranquilo.id, 30);
    await demanda(tranquilo.id, 30);

    const lista = await sugerirFiscais();

    expect(nomes(lista)).toEqual(['Com duas folgadas', 'Com uma vencida']);
    expect(lista[1]).toMatchObject({ ativas: 1, emRisco: 1 });
    expect(lista[1]!.resumo).toBe('1 demanda ativa · 1 com prazo crítico ou vencido');
  });

  it('o limite do prazo crítico é de 5 dias', async () => {
    const { demanda } = await comOrgao();
    const fiscal = await criarFiscal('Fiscal');
    await demanda(fiscal.id, 5);
    await demanda(fiscal.id, 6);

    const [sugestao] = await sugerirFiscais();
    expect(sugestao).toMatchObject({ ativas: 2, emRisco: 1 });
  });

  it('demandas concluídas e em análise não contam como carga', async () => {
    const { demanda } = await comOrgao();
    const fiscal = await criarFiscal('Fiscal Folgado');
    await demanda(fiscal.id, 30, { status: 'concluida', concluidaEm: new Date() });
    await demanda(fiscal.id, 30, { status: 'concluida', concluidaEm: new Date() });
    await demanda(fiscal.id, 30, { status: 'em_analise', origem: 'campo' });
    await demanda(fiscal.id, 30, { status: 'em_andamento' });

    const [sugestao] = await sugerirFiscais();
    expect(sugestao).toMatchObject({ ativas: 1, emRisco: 0 });
  });

  it('já ter atendido o órgão desempata cargas iguais', async () => {
    const { orgao, demanda } = await comOrgao();
    const outroOrgao = await criarDemandante('Outro órgão');
    const ana = await criarFiscal('Ana'); // por nome viria primeiro
    const zeca = await criarFiscal('Zeca'); // mas já atendeu o órgão (uma concluída, que não conta como carga)
    // A demanda da Ana é de outro órgão: sem afinidade com o órgão da nova demanda
    await criarDemanda({ demandanteId: outroOrgao.id, fiscalId: ana.id, assunto: 'x', prazo: data(em(30)) });
    await demanda(zeca.id, 30);
    await demanda(zeca.id, 30, { status: 'concluida', concluidaEm: new Date() });

    const comOrgaoInformado = await sugerirFiscais(orgao.id);
    expect(nomes(comOrgaoInformado)).toEqual(['Zeca', 'Ana']);
    expect(comOrgaoInformado[0]!.atendimentosDoOrgao).toBe(2);
    expect(comOrgaoInformado[0]!.resumo).toContain('já atendeu este órgão');

    // Sem o órgão a afinidade não existe e vale o nome; com o OUTRO órgão, quem tem afinidade é a Ana
    expect(nomes(await sugerirFiscais())).toEqual(['Ana', 'Zeca']);
    expect(nomes(await sugerirFiscais(outroOrgao.id))).toEqual(['Ana', 'Zeca']);
    expect((await sugerirFiscais(outroOrgao.id))[0]!.atendimentosDoOrgao).toBe(1);
  });

  it('a afinidade nunca faz passar à frente quem tem menos carga', async () => {
    const { orgao, demanda } = await comOrgao();
    const folgado = await criarFiscal('Folgado');
    const conhecedor = await criarFiscal('Conhecedor do órgão');
    await demanda(conhecedor.id, 30); // 1 ativa (e já atende o órgão)

    const lista = await sugerirFiscais(orgao.id);
    expect(nomes(lista)).toEqual(['Folgado', 'Conhecedor do órgão']);
    expect(lista[0]!.fiscalId).toBe(folgado.id);
  });

  it('empate total é decidido pelo nome, em ordem alfabética do português', async () => {
    await criarFiscal('Zélia');
    await criarFiscal('Ágata');
    await criarFiscal('Beto');
    expect(nomes(await sugerirFiscais())).toEqual(['Ágata', 'Beto', 'Zélia']);
  });

  it('não sugere quem tem acesso ao sistema bloqueado; inclui quem não tem acesso ou está ativo', async () => {
    const bloqueado = await criarUsuarioComSessao('inspetor', { status: 'bloqueado' });
    const ativo = await criarUsuarioComSessao('inspetor');
    await criarFiscal('Bloqueado', bloqueado.user.id);
    await criarFiscal('Ativo com acesso', ativo.user.id);
    await criarFiscal('Sem acesso ao sistema');

    expect(nomes(await sugerirFiscais()).sort()).toEqual(['Ativo com acesso', 'Sem acesso ao sistema']);
  });

  it('sem fiscais cadastrados devolve lista vazia', async () => {
    expect(await sugerirFiscais()).toEqual([]);
  });
});

describe('GET /api/fiscais/sugestoes', () => {
  it('exige login e é só do gestor', async () => {
    await request(app).get('/api/fiscais/sugestoes').expect(401);
    for (const perfil of ['inspetor', 'representante'] as const) {
      const { cookie } = await criarUsuarioComSessao(perfil);
      await request(app).get('/api/fiscais/sugestoes').set('Cookie', cookie).expect(403);
    }
  });

  it('devolve o ranking, com ou sem o órgão', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const { orgao, demanda } = await comOrgao();
    const ocupado = await criarFiscal('Ocupado');
    await criarFiscal('Livre');
    await demanda(ocupado.id, 30);

    const sem = await request(app).get('/api/fiscais/sugestoes').set('Cookie', gestor.cookie).expect(200);
    expect(nomes(sem.body)).toEqual(['Livre', 'Ocupado']);
    expect(sem.body[0]).toMatchObject({ sugerido: true, ativas: 0, pontos: 0 });

    const com = await request(app)
      .get(`/api/fiscais/sugestoes?demandanteId=${orgao.id}`)
      .set('Cookie', gestor.cookie)
      .expect(200);
    expect(com.body[1]).toMatchObject({ nome: 'Ocupado', atendimentosDoOrgao: 1 });

    // Parâmetro vazio, como um formulário sem escolha, equivale a não informar
    await request(app).get('/api/fiscais/sugestoes?demandanteId=').set('Cookie', gestor.cookie).expect(200);
  });

  it('rejeita órgão inválido', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    for (const valor of ['abc', '0', '-3', '1.5']) {
      const res = await request(app).get(`/api/fiscais/sugestoes?demandanteId=${valor}`).set('Cookie', gestor.cookie);
      expect(res.status, valor).toBe(400);
      expect(res.body.erro).toBe('Órgão inválido.');
    }
  });
});
