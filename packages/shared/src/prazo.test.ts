import { describe, expect, it } from 'vitest';
import {
  adicionarDias,
  chaveMesNoFuso,
  dataIsoValida,
  diasParaPrazo,
  hojeNoFuso,
  inicioDoDia,
  numeroDemanda,
  statusExibicao,
  ultimosMeses,
} from './prazo';

describe('diasParaPrazo', () => {
  it('retorna 0 para o próprio dia, 1 para amanhã e -1 para ontem', () => {
    expect(diasParaPrazo('2026-10-03', '2026-10-03')).toBe(0);
    expect(diasParaPrazo('2026-10-04', '2026-10-03')).toBe(1);
    expect(diasParaPrazo('2026-10-02', '2026-10-03')).toBe(-1);
  });

  it('atravessa virada de mês e de ano', () => {
    expect(diasParaPrazo('2026-11-01', '2026-10-31')).toBe(1);
    expect(diasParaPrazo('2027-01-01', '2026-12-31')).toBe(1);
  });

  it('aceita ISO com horário, usando só a data', () => {
    expect(diasParaPrazo('2026-10-05T00:00:00.000Z', '2026-10-03')).toBe(2);
  });
});

describe('statusExibicao', () => {
  const hoje = '2026-10-03';

  it('concluída nunca muda, mesmo vencida', () => {
    expect(statusExibicao('concluida', '2026-01-01', hoje)).toBe('concluida');
  });

  it('em análise não é afetada pelo prazo, nem vencido', () => {
    expect(statusExibicao('em_analise', '2026-01-01', hoje)).toBe('em_analise');
    expect(statusExibicao('em_analise', '2026-10-04', hoje)).toBe('em_analise');
  });

  it('vencida quando o prazo passou', () => {
    expect(statusExibicao('aberta', '2026-10-02', hoje)).toBe('vencida');
  });

  it('prazo crítico de 0 a 5 dias', () => {
    expect(statusExibicao('aberta', '2026-10-03', hoje)).toBe('prazo_critico');
    expect(statusExibicao('em_andamento', '2026-10-08', hoje)).toBe('prazo_critico');
  });

  it('mantém o status salvo quando faltam mais de 5 dias', () => {
    expect(statusExibicao('aberta', '2026-10-09', hoje)).toBe('aberta');
    expect(statusExibicao('em_andamento', '2026-11-01', hoje)).toBe('em_andamento');
  });
});

describe('hojeNoFuso', () => {
  it('usa o fuso de Recife, não o UTC', () => {
    // 01:00 UTC do dia 04 ainda é 22:00 do dia 03 em Recife (UTC-3)
    expect(hojeNoFuso('America/Recife', new Date('2026-10-04T01:00:00Z'))).toBe('2026-10-03');
    expect(hojeNoFuso('America/Recife', new Date('2026-10-04T04:00:00Z'))).toBe('2026-10-04');
  });
});

describe('inicioDoDia', () => {
  it('é a meia-noite local convertida para UTC', () => {
    expect(inicioDoDia('2026-10-03', 'America/Recife').toISOString()).toBe('2026-10-03T03:00:00.000Z'); // UTC-3
    expect(inicioDoDia('2026-10-03', 'UTC').toISOString()).toBe('2026-10-03T00:00:00.000Z');
    expect(inicioDoDia('2026-10-03', 'Asia/Tokyo').toISOString()).toBe('2026-10-02T15:00:00.000Z'); // UTC+9
  });

  it('uma demanda cadastrada às 22h em Recife pertence ao dia local, não ao dia seguinte em UTC', () => {
    const cadastro = new Date('2026-10-04T01:00:00Z'); // 22:00 do dia 03 em Recife
    expect(cadastro >= inicioDoDia('2026-10-03', 'America/Recife')).toBe(true);
    expect(cadastro < inicioDoDia('2026-10-04', 'America/Recife')).toBe(true);
  });

  it('atravessa virada de mês e de ano', () => {
    expect(inicioDoDia('2027-01-01', 'America/Recife').toISOString()).toBe('2027-01-01T03:00:00.000Z');
    expect(inicioDoDia(adicionarDias('2026-12-31', 1), 'America/Recife').toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });
});

describe('utilitários', () => {
  it('adicionarDias', () => {
    expect(adicionarDias('2026-10-03', 5)).toBe('2026-10-08');
    expect(adicionarDias('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('dataIsoValida rejeita datas inexistentes e formatos errados', () => {
    expect(dataIsoValida('2026-10-03')).toBe(true);
    expect(dataIsoValida('2026-02-30')).toBe(false);
    expect(dataIsoValida('03/10/2026')).toBe(false);
    expect(dataIsoValida('')).toBe(false);
  });

  it('numeroDemanda', () => {
    expect(numeroDemanda(7)).toBe('DEM-0007');
    expect(numeroDemanda(12345)).toBe('DEM-12345');
  });

  it('ultimosMeses cobre a virada de ano, do mais antigo ao atual', () => {
    const meses = ultimosMeses('2026-02-15', 4);
    expect(meses).toEqual([
      { chave: '2025-11', mes: 'Nov' },
      { chave: '2025-12', mes: 'Dez' },
      { chave: '2026-01', mes: 'Jan' },
      { chave: '2026-02', mes: 'Fev' },
    ]);
  });

  it('chaveMesNoFuso usa o fuso do negócio na virada de mês', () => {
    // 01:00 UTC de 1º/nov ainda é 22:00 de 31/out em Recife
    expect(chaveMesNoFuso(new Date('2026-11-01T01:00:00Z'), 'America/Recife')).toBe('2026-10');
    expect(chaveMesNoFuso(new Date('2026-11-01T04:00:00Z'), 'America/Recife')).toBe('2026-11');
  });
});
