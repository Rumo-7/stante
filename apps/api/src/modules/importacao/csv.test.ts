import { describe, expect, it } from 'vitest';
import { decodificar, detectarSeparador, lerCsv } from './csv';

describe('decodificar', () => {
  it('lê UTF-8 e remove o BOM que o Excel coloca no início', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Órgão;Assunto')]);
    expect(decodificar(bytes)).toBe('Órgão;Assunto');
  });

  it('reconhece Windows-1252 (o "ANSI" do Excel) sem estragar os acentos', () => {
    // "Órgão" em Windows-1252: Ó = 0xD3, ã = 0xE3
    const bytes = new Uint8Array([0xd3, 0x72, 0x67, 0xe3, 0x6f]);
    expect(decodificar(bytes)).toBe('Órgão');
  });
});

describe('detectarSeparador', () => {
  it('usa ";" quando ele aparece mais no cabeçalho (Excel em português)', () => {
    expect(detectarSeparador('Processo;Órgão;Assunto\n1;2;3')).toBe(';');
  });

  it('usa "," quando ela aparece mais', () => {
    expect(detectarSeparador('Processo,Órgão,Assunto\n1,2,3')).toBe(',');
  });

  it('não conta separadores dentro de aspas', () => {
    expect(detectarSeparador('"A, B, C";Assunto;Prazo')).toBe(';');
  });
});

describe('lerCsv', () => {
  it('separa linhas e células, aceitando quebra de linha do Windows', () => {
    expect(lerCsv('a;b\r\nc;d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('aceita separador e quebra de linha dentro de aspas, e aspas duplas como aspa literal', () => {
    const texto = 'Assunto;Obs\n"Rua A; nº 5";"Ofício ""urgente""\nsegunda linha"';
    expect(lerCsv(texto)).toEqual([
      ['Assunto', 'Obs'],
      ['Rua A; nº 5', 'Ofício "urgente"\nsegunda linha'],
    ]);
  });

  it('mantém linhas vazias para a posição bater com o número da linha na planilha', () => {
    expect(lerCsv('a\n\nb')).toEqual([['a'], [''], ['b']]);
  });

  it('lê a última linha mesmo sem quebra de linha no final', () => {
    expect(lerCsv('a;b\nc;d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});
