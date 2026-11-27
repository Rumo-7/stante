import { describe, expect, it } from 'vitest';
import { ehEtapaAnterior } from './etapas';

describe('ehEtapaAnterior', () => {
  it('retorna true quando a etapa escolhida é anterior à atual', () => {
    expect(ehEtapaAnterior('em_andamento', 'aberta')).toBe(true);
    expect(ehEtapaAnterior('concluida', 'em_andamento')).toBe(true);
    expect(ehEtapaAnterior('concluida', 'aberta')).toBe(true);
  });

  it('retorna false ao avançar, manter a mesma etapa ou usar em_analise', () => {
    expect(ehEtapaAnterior('aberta', 'em_andamento')).toBe(false);
    expect(ehEtapaAnterior('aberta', 'concluida')).toBe(false);
    expect(ehEtapaAnterior('em_andamento', 'concluida')).toBe(false);
    expect(ehEtapaAnterior('aberta', 'aberta')).toBe(false);
    expect(ehEtapaAnterior('em_andamento', 'em_andamento')).toBe(false);
    expect(ehEtapaAnterior('concluida', 'concluida')).toBe(false);
    expect(ehEtapaAnterior('em_analise', 'aberta')).toBe(false);
    expect(ehEtapaAnterior('aberta', 'em_analise')).toBe(false);
  });
});
