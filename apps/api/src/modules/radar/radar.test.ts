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
import { avaliarRisco, type ContextoDeRisco, type DemandaParaRisco } from './risco';

const contexto = (extras: Partial<ContextoDeRisco> = {}): ContextoDeRisco => ({
  hoje: '2026-10-10',
  nomeDoOrgao: () => 'Órgão X',
  ritmoDoOrgao: new Map(),
  ritmoGeral: null,
  cargaDoFiscal: new Map(),
  cargaTipicaDaEquipe: null,
  ...extras,
});

const demanda = (extras: Partial<DemandaParaRisco> = {}): DemandaParaRisco => ({
  id: 1,
  demandanteId: 1,
  fiscalId: 1,
  status: 'aberta',
  prazo: '2026-10-20',
  cadastro: '2026-10-05', // 15 dias concedidos; hoje faltam 10
  ...extras,
});

describe('avaliarRisco', () => {
  it('demanda vencida não entra no radar: já aparece como vencida', () => {
    expect(avaliarRisco(demanda({ prazo: '2026-10-09' }), contexto())).toBeNull();
  });

  it('sem nenhum sinal de risco, devolve null', () => {
    expect(avaliarRisco(demanda(), contexto())).toBeNull();
  });

  describe('ritmo do órgão', () => {
    const ritmoLento = { medianaDias: 20, amostra: 6 };

    it('prazo menor que o tempo típico: risco alto, explicado com os números', () => {
      const risco = avaliarRisco(
        demanda({ cadastro: '2026-10-05', prazo: '2026-10-17' }), // 12 dias concedidos
        contexto({ ritmoDoOrgao: new Map([[1, ritmoLento]]) }),
      );
      expect(risco?.nivel).toBe('alto');
      expect(risco?.motivos[0]).toContain('costuma levar 20 dias');
      expect(risco?.motivos[0]).toContain('mediana de 6 demandas');
      expect(risco?.motivos[0]).toContain('12 dias');
    });

    it('quem já está em andamento pesa menos: risco médio', () => {
      const risco = avaliarRisco(
        demanda({ status: 'em_andamento', prazo: '2026-10-17' }),
        contexto({ ritmoDoOrgao: new Map([[1, ritmoLento]]) }),
      );
      expect(risco?.nivel).toBe('medio');
    });

    it('prazo folgado em relação ao tempo típico: sem risco', () => {
      const folgado = avaliarRisco(
        demanda({ cadastro: '2026-10-05', prazo: '2026-11-05' }), // 31 dias concedidos para um típico de 20
        contexto({ ritmoDoOrgao: new Map([[1, ritmoLento]]) }),
      );
      expect(folgado).toBeNull();
    });

    it('histórico com menos de 3 demandas é palpite e é ignorado', () => {
      const risco = avaliarRisco(
        demanda({ prazo: '2026-10-12' }),
        contexto({ ritmoDoOrgao: new Map([[1, { medianaDias: 30, amostra: 2 }]]) }),
      );
      expect(risco).toBeNull();
    });

    it('sem histórico do órgão, usa o da unidade e diz isso', () => {
      const risco = avaliarRisco(
        demanda({ prazo: '2026-10-12' }),
        contexto({ ritmoGeral: { medianaDias: 15, amostra: 40 } }),
      );
      expect(risco?.nivel).toBe('alto');
      expect(risco?.motivos[0]).toContain('Na unidade');
      expect(risco?.motivos[0]).toContain('mediana de 40 demandas');
    });

    it('prazo apertado (até 2 dias de folga) soma só um ponto', () => {
      const apertado = contexto({ ritmoDoOrgao: new Map([[1, { medianaDias: 14, amostra: 5 }]]) });
      // 15 dias concedidos para um típico de 14: 1 ponto, não basta
      expect(avaliarRisco(demanda(), apertado)).toBeNull();
      // somado a "sem fiscal" (mais 1 ponto, com prazo longe) chega a médio
      const risco = avaliarRisco(demanda({ fiscalId: null }), apertado);
      expect(risco?.nivel).toBe('medio');
      expect(risco?.motivos.join(' ')).toContain('apertado');
    });

    it('já passou do tempo típico e continua aberta: mais um ponto', () => {
      const ctx = contexto({ ritmoDoOrgao: new Map([[1, { medianaDias: 4, amostra: 5 }]]) });
      // cadastrada há 5 dias (típico 4), com 15 de prazo: só o "passou do típico" pesa, 1 ponto
      expect(avaliarRisco(demanda(), ctx)).toBeNull();
      const risco = avaliarRisco(demanda({ fiscalId: null }), ctx);
      expect(risco?.nivel).toBe('medio');
      expect(risco?.motivos.join(' ')).toContain('Já passou do tempo típico');
    });
  });

  describe('fiscal', () => {
    it('sem fiscal e o prazo chegando: dois pontos, risco médio', () => {
      // em andamento: assim a regra de "ainda não iniciada" não soma e o caso testa só a falta de fiscal
      const risco = avaliarRisco(demanda({ fiscalId: null, prazo: '2026-10-15', status: 'em_andamento' }), contexto());
      expect(risco?.nivel).toBe('medio');
      expect(risco?.motivos[0]).toBe('Sem fiscal atribuído e faltam só 5 dias.');
    });

    it('sem fiscal mas com muito prazo: um ponto só, sem alerta', () => {
      expect(avaliarRisco(demanda({ fiscalId: null, prazo: '2026-11-30' }), contexto())).toBeNull();
    });

    it('fiscal sobrecarregado: só a carga não basta, mas soma', () => {
      const sobrecarregado = contexto({ cargaDoFiscal: new Map([[1, 8]]), cargaTipicaDaEquipe: 3 });
      expect(avaliarRisco(demanda(), sobrecarregado)).toBeNull();

      const comPrazoApertado = contexto({
        cargaDoFiscal: new Map([[1, 8]]),
        cargaTipicaDaEquipe: 3,
        ritmoDoOrgao: new Map([[1, { medianaDias: 14, amostra: 5 }]]),
      });
      const risco = avaliarRisco(demanda(), comPrazoApertado);
      expect(risco?.nivel).toBe('medio');
      expect(risco?.motivos.join(' ')).toContain('8 demandas em andamento (a mediana da equipe é 3)');
    });

    it('carga só um pouco acima da típica não é sobrecarga', () => {
      // mediana 3: o limite é max(ceil(4,5), 5) = 5
      // Já há 1 ponto do prazo apertado (15 dias para um típico de 14). Se a carga 4 contasse como
      // sobrecarga, seriam 2 pontos e a demanda apareceria; como não conta, continua sem alerta.
      const ctx = contexto({ cargaDoFiscal: new Map([[1, 4]]), cargaTipicaDaEquipe: 3, ritmoGeral: { medianaDias: 14, amostra: 9 } });
      expect(avaliarRisco(demanda(), ctx)).toBeNull();
    });
  });

  it('demanda que nem começou e já gastou mais da metade do prazo soma um ponto', () => {
    // 15 dias concedidos, cadastrada há 10: mais da metade; sem fiscal e com prazo curto completa
    const risco = avaliarRisco(demanda({ cadastro: '2026-09-30', prazo: '2026-10-15', fiscalId: null }), contexto());
    expect(risco?.nivel).toBe('alto');
    expect(risco?.motivos.join(' ')).toContain('Ainda não foi iniciada e já passou mais da metade do prazo');
  });

  it('em andamento não recebe o aviso de "não iniciada"', () => {
    const risco = avaliarRisco(demanda({ status: 'em_andamento', cadastro: '2026-09-30', prazo: '2026-10-15', fiscalId: null }), contexto());
    expect(risco?.motivos.join(' ')).not.toContain('Ainda não foi iniciada');
  });

  it('os motivos vêm do mais pesado para o mais leve', () => {
    const risco = avaliarRisco(
      demanda({ cadastro: '2026-09-30', prazo: '2026-10-15', fiscalId: null }),
      contexto({ ritmoDoOrgao: new Map([[1, { medianaDias: 30, amostra: 8 }]]) }),
    );
    expect(risco?.nivel).toBe('alto');
    expect(risco?.motivos[0]).toContain('costuma levar 30 dias'); // 3 pontos
    expect(risco?.motivos[1]).toContain('Sem fiscal'); // 2 pontos
  });

  it('mostra dias com vírgula e no singular', () => {
    const risco = avaliarRisco(
      demanda({ fiscalId: null, prazo: '2026-10-11' }),
      contexto({ ritmoGeral: { medianaDias: 12.5, amostra: 7 } }),
    );
    expect(risco?.motivos.join(' ')).toContain('12,5 dias');
    expect(risco?.motivos.join(' ')).toContain('faltam só 1 dia.');
  });
});

describe('GET /api/radar', () => {
  const app = createApp({ gerador: null });
  const DIA_MS = 24 * 60 * 60 * 1000;
  const em = (dias: number) => adicionarDias(hojeNoFuso(), dias);

  beforeEach(limparBanco);
  afterAll(() => prisma.$disconnect());

  /** Três demandas concluídas que levaram 20 dias cada: o "tempo típico" do órgão passa a ser 20. */
  async function comHistoricoDe20Dias(demandanteId: number, diasAtras = 100) {
    for (let i = 1; i <= 3; i += 1) {
      const createdAt = new Date(Date.now() - (diasAtras + i) * DIA_MS);
      await criarDemanda({
        demandanteId, assunto: 'histórico', prazo: data(em(-30)), status: 'concluida',
        createdAt, concluidaEm: new Date(createdAt.getTime() + 20 * DIA_MS),
      });
    }
  }

  const nova = (demandanteId: number, prazoEmDias: number, extras: Partial<Prisma.DemandaUncheckedCreateInput> = {}) =>
    criarDemanda({
      demandanteId, assunto: 'em andamento', prazo: data(em(prazoEmDias)),
      createdAt: new Date(Date.now() - 2 * DIA_MS), ...extras,
    });

  const radar = (cookie: string) => request(app).get('/api/radar').set('Cookie', cookie);

  it('exige login; o representante não vê a avaliação interna', async () => {
    await request(app).get('/api/radar').expect(401);
    const orgao = await criarDemandante();
    const representante = await criarUsuarioComSessao('representante', { demandanteId: orgao.id });
    await radar(representante.cookie).expect(403);
  });

  it('avisa da demanda cujo prazo é menor que o tempo que o órgão costuma levar', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const orgao = await criarDemandante('Órgão Lento');
    const fiscal = await criarFiscal('Fiscal');
    await comHistoricoDe20Dias(orgao.id);
    const emRisco = await nova(orgao.id, 10, { fiscalId: fiscal.id }); // 12 dias concedidos para um típico de 20
    await nova(orgao.id, 40, { fiscalId: fiscal.id }); // 42 dias: folgado

    const res = await radar(gestor.cookie).expect(200);

    expect(res.body.totais).toEqual({ alto: 1, medio: 0 });
    expect(res.body.itens).toHaveLength(1);
    expect(res.body.itens[0]).toMatchObject({
      demandaId: emRisco.id,
      demandante: 'Órgão Lento',
      fiscal: 'Fiscal',
      prazo: em(10),
      diasRestantes: 10,
      nivel: 'alto',
    });
    expect(res.body.itens[0].numero).toMatch(/^DEM-\d{4}$/);
    expect(res.body.itens[0].motivos[0]).toContain('costuma levar 20 dias');
  });

  it('não entram: vencidas, concluídas, em análise, nem demandas de órgão sem histórico nem sinal', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const orgao = await criarDemandante('Órgão Lento');
    const fiscal = await criarFiscal('Fiscal');
    await comHistoricoDe20Dias(orgao.id);
    await nova(orgao.id, -1, { fiscalId: fiscal.id }); // vencida
    await nova(orgao.id, 10, { fiscalId: fiscal.id, status: 'concluida', concluidaEm: new Date() });
    await nova(orgao.id, 10, { fiscalId: fiscal.id, status: 'em_analise', origem: 'campo' });
    const outroOrgao = await criarDemandante('Órgão Novo');
    await nova(outroOrgao.id, 30, { fiscalId: fiscal.id });

    const res = await radar(gestor.cookie).expect(200);
    expect(res.body.itens).toEqual([]);
    expect(res.body.totais).toEqual({ alto: 0, medio: 0 });
  });

  it('o histórico com mais de um ano não conta como ritmo', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const orgao = await criarDemandante('Órgão');
    const fiscal = await criarFiscal('Fiscal');
    await comHistoricoDe20Dias(orgao.id, 400);
    await nova(orgao.id, 10, { fiscalId: fiscal.id });

    expect((await radar(gestor.cookie).expect(200)).body.itens).toEqual([]);
  });

  it('ordena do mais arriscado para o menos e, entre iguais, pelo prazo mais próximo', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const orgao = await criarDemandante('Órgão Lento');
    const fiscal = await criarFiscal('Fiscal');
    await comHistoricoDe20Dias(orgao.id);
    const altoLonge = await nova(orgao.id, 15, { fiscalId: fiscal.id });
    const altoPerto = await nova(orgao.id, 8, { fiscalId: fiscal.id });
    const medio = await nova(orgao.id, 5, { fiscalId: fiscal.id, status: 'em_andamento' });

    const res = await radar(gestor.cookie).expect(200);

    expect(res.body.itens.map((i: { demandaId: number }) => i.demandaId)).toEqual([altoPerto.id, altoLonge.id, medio.id]);
    expect(res.body.itens.map((i: { nivel: string }) => i.nivel)).toEqual(['alto', 'alto', 'medio']);
    expect(res.body.totais).toEqual({ alto: 2, medio: 1 });
  });

  it('o inspetor vê só o risco das próprias demandas, mas com o ritmo de toda a unidade', async () => {
    const inspetor = await criarUsuarioComSessao('inspetor');
    const meuFiscal = await criarFiscal('Meu', inspetor.user.id);
    const outroFiscal = await criarFiscal('Outro');
    const gestor = await criarUsuarioComSessao('gestor');
    const orgao = await criarDemandante('Órgão Lento');
    await comHistoricoDe20Dias(orgao.id);
    const minha = await nova(orgao.id, 10, { fiscalId: meuFiscal.id });
    const alheia = await nova(orgao.id, 10, { fiscalId: outroFiscal.id });

    const doInspetor = await radar(inspetor.cookie).expect(200);
    const doGestor = await radar(gestor.cookie).expect(200);

    expect(doInspetor.body.itens.map((i: { demandaId: number }) => i.demandaId)).toEqual([minha.id]);
    expect(doGestor.body.itens.map((i: { demandaId: number }) => i.demandaId).sort()).toEqual([minha.id, alheia.id].sort());
  });

  it('fiscal sobrecarregado entra na conta (comparando com a mediana da equipe)', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const orgao = await criarDemandante('Órgão');
    const sobrecarregado = await criarFiscal('Sobrecarregado');
    await criarFiscal('Livre 1');
    await criarFiscal('Livre 2');
    for (let i = 0; i < 7; i += 1) await nova(orgao.id, 60, { fiscalId: sobrecarregado.id });
    // sem ritmo e com prazo longe, a demanda só tem o motivo da carga (1 ponto): não aparece
    expect((await radar(gestor.cookie).expect(200)).body.itens).toEqual([]);

    // mas uma demanda dele que também está sem início e já gastou metade do prazo passa de 2 pontos
    const atrasando = await nova(orgao.id, 3, {
      fiscalId: sobrecarregado.id,
      createdAt: new Date(Date.now() - 20 * DIA_MS),
    });
    const res = await radar(gestor.cookie).expect(200);
    const item = res.body.itens.find((i: { demandaId: number }) => i.demandaId === atrasando.id);
    expect(item.motivos.join(' ')).toContain('demandas em andamento (a mediana da equipe é');
  });
});
