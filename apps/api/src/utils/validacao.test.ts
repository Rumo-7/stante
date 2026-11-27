import { describe, expect, it } from 'vitest';
import { ehIdValido, MAX_INT32 } from './validacao';

describe('ehIdValido', () => {
  it('aceita inteiros positivos até o limite do INT4', () => {
    expect(ehIdValido(1)).toBe(true);
    expect(ehIdValido(42)).toBe(true);
    expect(ehIdValido(MAX_INT32)).toBe(true);
  });

  it('recusa zero, negativos e valores acima do INT4', () => {
    expect(ehIdValido(0)).toBe(false);
    expect(ehIdValido(-1)).toBe(false);
    expect(ehIdValido(MAX_INT32 + 1)).toBe(false);
  });

  it('recusa o que não é inteiro', () => {
    expect(ehIdValido(1.5)).toBe(false);
    expect(ehIdValido(NaN)).toBe(false);
    expect(ehIdValido(Infinity)).toBe(false);
  });
});
