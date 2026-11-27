import { describe, expect, it } from 'vitest';
import { ROTULO_TIPO_HISTORICO, rotuloTipoHistorico } from './historico';

describe('rotuloTipoHistorico', () => {
  it('dá nomes curtos para status, prazo e fiscal', () => {
    expect(rotuloTipoHistorico('status_alterado')).toBe('Status');
    expect(rotuloTipoHistorico('prazo_alterado')).toBe('Prazo');
    expect(rotuloTipoHistorico('fiscal_alterado')).toBe('Fiscal');
  });

  it('anexo adicionado e removido usam o mesmo nome', () => {
    expect(rotuloTipoHistorico('anexo_adicionado')).toBe('Anexo');
    expect(rotuloTipoHistorico('anexo_removido')).toBe('Anexo');
  });

  it('tipo desconhecido vira um nome genérico', () => {
    expect(rotuloTipoHistorico('tipo_que_nao_existe')).toBe('Alteração');
    expect(rotuloTipoHistorico('')).toBe('Alteração');
  });

  it('todo tipo tem um nome preenchido', () => {
    for (const rotulo of Object.values(ROTULO_TIPO_HISTORICO)) {
      expect(rotulo.trim()).not.toBe('');
    }
  });
});
