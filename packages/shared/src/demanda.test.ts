import { describe, expect, it } from 'vitest';
import { ehRetornoDeEtapa } from './demanda';

describe('ehRetornoDeEtapa', () => {
  it('identifica retorno quando o destino é uma etapa anterior na ordem do fluxo', () => {
    expect(ehRetornoDeEtapa('em_andamento', 'aberta')).toBe(true);
    expect(ehRetornoDeEtapa('concluida', 'em_andamento')).toBe(true);
    expect(ehRetornoDeEtapa('concluida', 'aberta')).toBe(true);
  });

  it('retorna false ao avançar de etapa', () => {
    expect(ehRetornoDeEtapa('aberta', 'em_andamento')).toBe(false);
    expect(ehRetornoDeEtapa('aberta', 'concluida')).toBe(false);
    expect(ehRetornoDeEtapa('em_andamento', 'concluida')).toBe(false);
  });

  it('retorna false para o mesmo status', () => {
    expect(ehRetornoDeEtapa('aberta', 'aberta')).toBe(false);
    expect(ehRetornoDeEtapa('em_andamento', 'em_andamento')).toBe(false);
    expect(ehRetornoDeEtapa('concluida', 'concluida')).toBe(false);
  });

  it('retorna false para status fora da ordem editável, como em_analise', () => {
    expect(ehRetornoDeEtapa('em_analise', 'aberta')).toBe(false);
    expect(ehRetornoDeEtapa('em_analise', 'em_andamento')).toBe(false);
    expect(ehRetornoDeEtapa('em_analise', 'concluida')).toBe(false);
    expect(ehRetornoDeEtapa('aberta', 'em_analise')).toBe(false);
    expect(ehRetornoDeEtapa('em_andamento', 'em_analise')).toBe(false);
    expect(ehRetornoDeEtapa('concluida', 'em_analise')).toBe(false);
    expect(ehRetornoDeEtapa('em_analise', 'em_analise')).toBe(false);
  });
});
