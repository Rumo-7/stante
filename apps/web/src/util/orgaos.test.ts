import { describe, expect, it } from 'vitest';
import { formatarDias, formatarPorcentagem, rotuloCurto } from './orgaos';

describe('rotuloCurto', () => {
  it('usa a sigla entre parênteses no fim do nome', () => {
    expect(rotuloCurto('Ministério Público do Trabalho (MPT)')).toBe('MPT');
    expect(rotuloCurto('Comissão Intersetorial de Saúde do Trabalhador e da Trabalhadora (CISTT)')).toBe('CISTT');
    expect(rotuloCurto('Unidades Básicas de Saúde (UBS)  ')).toBe('UBS');
  });

  it('sem sigla, mantém nomes curtos e corta os longos com reticências', () => {
    expect(rotuloCurto('Justiça do Trabalho')).toBe('Justiça do Trabalho');
    const longo = 'Sindicato dos Trabalhadores da Indústria de Alimentação do Recife';
    const curto = rotuloCurto(longo);
    expect(curto.length).toBeLessThanOrEqual(28);
    expect(curto.endsWith('…')).toBe(true);
  });

  it('parênteses no meio do nome não são sigla', () => {
    expect(rotuloCurto('Órgão (antigo) de Teste')).toBe('Órgão (antigo) de Teste');
  });
});

describe('formatadores', () => {
  it('porcentagem', () => {
    expect(formatarPorcentagem(0.733)).toBe('73%');
    expect(formatarPorcentagem(1)).toBe('100%');
    expect(formatarPorcentagem(0)).toBe('0%');
    expect(formatarPorcentagem(null)).toBe('—');
  });

  it('dias, com vírgula decimal', () => {
    expect(formatarDias(16.5)).toBe('16,5 d');
    expect(formatarDias(4)).toBe('4 d');
    expect(formatarDias(null)).toBe('—');
  });
});
