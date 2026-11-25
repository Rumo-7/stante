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
describe('fiscal alterado', () => {
  it('atribuir um fiscal a uma demanda sem fiscal', () => {
    expect(descrever('fiscal_alterado', { de: null, para: 'Carla Fiscal' })).toBe('Fiscal atribuído: Carla Fiscal');
  });

  it('remover o fiscal mostra quem era', () => {
    expect(descrever('fiscal_alterado', { de: 'Carla Fiscal', para: null })).toBe(
      'Fiscal removido (era Carla Fiscal)',
    );
  });

  it('trocar de fiscal mostra o antes e o depois', () => {
    expect(descrever('fiscal_alterado', { de: 'Primeiro', para: 'Segundo' })).toBe(
      'Fiscal alterado de Primeiro para Segundo',
    );
  });
});