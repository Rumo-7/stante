import { describe, expect, it } from 'vitest';
import type { EstatisticasOrgao } from '../api/demandantes';
import { AMOSTRA_MINIMA, calcularDestaques } from './destaques';

function orgao(id: number, nome: string, extras: Partial<EstatisticasOrgao> = {}): EstatisticasOrgao {
  return {
    id,
    nome,
    tipo: 'outro',
    tipoRotulo: 'Outros',
    recebidas: 0,
    concluidas: 0,
    noPrazo: 0,
    foraDoPrazo: 0,
    emAberto: 0,
    vencidas: 0,
    taxaConclusao: null,
    pontualidade: null,
    medianaDias: null,
    prazoConcedidoMedianoDias: null,
    ...extras,
  };
}

const chaves = (lista: ReturnType<typeof calcularDestaques>) => lista.map((d) => d.chave);
const destaque = (lista: ReturnType<typeof calcularDestaques>, chave: string) => lista.find((d) => d.chave === chave);

describe('calcularDestaques', () => {
  it('sem demandas não há o que destacar', () => {
    expect(calcularDestaques([orgao(1, 'A'), orgao(2, 'B')], 0)).toEqual([]);
    expect(calcularDestaques([], 0)).toEqual([]);
  });

  it('aponta quem mais envia, com a participação no total', () => {
    const lista = calcularDestaques([orgao(1, 'Grande', { recebidas: 6 }), orgao(2, 'Pequeno', { recebidas: 2 })], 8);
    expect(destaque(lista, 'volume')).toMatchObject({ orgao: 'Grande', detalhe: '6 demandas (75% do total)' });
  });

  it('singular quando é uma só demanda', () => {
    const lista = calcularDestaques([orgao(1, 'Único', { recebidas: 1 })], 1);
    expect(destaque(lista, 'volume')!.detalhe).toBe('1 demanda (100% do total)');
  });

  it('pontualidade: melhor e pior, só com amostra mínima e ao menos dois órgãos para comparar', () => {
    const bom = orgao(1, 'Pontual', { recebidas: 4, concluidas: 4, noPrazo: 4, pontualidade: 1 });
    const ruim = orgao(2, 'Atrasado', { recebidas: 5, concluidas: 3, noPrazo: 1, foraDoPrazo: 2, vencidas: 2, pontualidade: 0.2 });

    const lista = calcularDestaques([bom, ruim], 9);
    expect(destaque(lista, 'pontual')).toMatchObject({ orgao: 'Pontual', detalhe: '100% dentro do prazo' });
    expect(destaque(lista, 'atrasado')).toMatchObject({ orgao: 'Atrasado', detalhe: '20% dentro do prazo', tom: 'atencao' });

    // Um órgão sozinho não tem com quem ser comparado
    expect(chaves(calcularDestaques([bom], 4))).not.toContain('pontual');
  });

  it('"1 de 1 = 100%" não vira destaque: abaixo da amostra mínima o órgão é ignorado nas comparações', () => {
    const amostraPequena = orgao(1, 'Sortudo', { recebidas: 1, concluidas: 1, noPrazo: 1, pontualidade: 1 });
    const bom = orgao(2, 'Consistente', { recebidas: 5, concluidas: 5, noPrazo: 4, foraDoPrazo: 1, pontualidade: 0.8 });
    const ruim = orgao(3, 'Atrasado', { recebidas: 4, concluidas: 3, noPrazo: 1, foraDoPrazo: 2, vencidas: 1, pontualidade: 0.25 });

    const lista = calcularDestaques([amostraPequena, bom, ruim], 10);

    expect(destaque(lista, 'pontual')!.orgao).toBe('Consistente'); // e não o "Sortudo" de 100%
    expect(AMOSTRA_MINIMA).toBe(3);
  });

  it('se todos têm a mesma pontualidade, ninguém é "o menos pontual"', () => {
    const a = orgao(1, 'A', { recebidas: 3, noPrazo: 3, concluidas: 3, pontualidade: 1 });
    const b = orgao(2, 'B', { recebidas: 3, noPrazo: 3, concluidas: 3, pontualidade: 1 });
    const chavesDaLista = chaves(calcularDestaques([a, b], 6));
    expect(chavesDaLista).toContain('pontual');
    expect(chavesDaLista).not.toContain('atrasado');
  });

  it('quem leva mais tempo: maior mediana entre os que têm amostra, mostrando o prazo que costumam dar', () => {
    const rapido = orgao(1, 'Rápido', { recebidas: 4, concluidas: 4, medianaDias: 3 });
    const lento = orgao(2, 'Lento', { recebidas: 4, concluidas: 4, medianaDias: 21.5, prazoConcedidoMedianoDias: 15 });
    const poucos = orgao(3, 'Poucos dados', { recebidas: 1, concluidas: 1, medianaDias: 90 });

    const lista = calcularDestaques([rapido, lento, poucos], 9);
    expect(destaque(lista, 'demorado')).toMatchObject({
      orgao: 'Lento',
      detalhe: 'mediana de 21.5 dias; o prazo costuma ser de 15 dias',
    });
  });

  it('sem prazo concedido conhecido, a frase não inventa um', () => {
    const lento = orgao(1, 'Lento', { recebidas: 3, concluidas: 3, medianaDias: 10, prazoConcedidoMedianoDias: null });
    expect(destaque(calcularDestaques([lento], 3), 'demorado')!.detalhe).toBe('mediana de 10 dias');
  });

  it('vencidas: aponta o órgão com mais demandas vencidas hoje, se houver alguma', () => {
    const a = orgao(1, 'A', { recebidas: 5, vencidas: 1 });
    const b = orgao(2, 'B', { recebidas: 8, vencidas: 3 });
    expect(destaque(calcularDestaques([a, b], 13), 'vencidas')).toMatchObject({ orgao: 'B', detalhe: '3 de 8 demandas' });
    expect(chaves(calcularDestaques([orgao(1, 'A', { recebidas: 2 })], 2))).not.toContain('vencidas');
  });
});
