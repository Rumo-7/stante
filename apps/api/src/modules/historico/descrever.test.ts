import { describe, expect, it } from 'vitest';
import { descrever } from './historico';

// Testes só do texto: a partir do tipo e dos dados guardados, sem banco nem HTTP.

describe('demanda criada', () => {
  it('planejada pelo gestor', () => {
    expect(descrever('criada', { origem: 'planejada' })).toBe('Demanda criada');
  });

  it('aberta em campo avisa que aguarda validação', () => {
    expect(descrever('criada', { origem: 'campo' })).toBe(
      'Demanda aberta em campo (aguardando validação do gestor)',
    );
  });

  it('sem a origem guardada, vale como criada normalmente', () => {
    expect(descrever('criada', {})).toBe('Demanda criada');
  });
});

describe('demanda validada', () => {
  it('diz que foi o gestor quem validou', () => {
    expect(descrever('validada', {})).toBe('Demanda validada pelo gestor');
  });
});