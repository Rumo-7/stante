import { adicionarDias, DIAS_PRAZO_PADRAO } from '@stante/shared';
import { describe, expect, it } from 'vitest';
import { analisarPlanilha, criarBusca, lerData, mapearCabecalho, normalizar, type ContextoImportacao } from './analisar';

const HOJE = '2026-11-24';

const contexto = (extras: Partial<ContextoImportacao> = {}): ContextoImportacao => ({
  hoje: HOJE,
  demandantes: [
    { id: 1, nome: 'Ministério Público do Trabalho (MPT)' },
    { id: 2, nome: 'Justiça do Trabalho' },
  ],
  fiscais: [{ id: 10, nome: 'Carlos Melo' }],
  processosExistentes: new Set(),
  ...extras,
});

const CABECALHO = ['Processo SEI', 'Data de recebimento', 'Órgão demandante', 'Assunto', 'Prazo', 'Responsável', 'Situação'];

/** Analisa uma planilha com o cabeçalho padrão e devolve a primeira linha de dados. */
const analisarUma = (linha: string[], ctx = contexto()) => analisarPlanilha([CABECALHO, linha], ctx).linhas[0]!;

describe('normalizar', () => {
  it('ignora acentos, maiúsculas, pontuação e espaços extras', () => {
    expect(normalizar('  Nº do  Documento ')).toBe('n do documento');
    expect(normalizar('ÓRGÃO-Demandante')).toBe('orgao demandante');
  });
});

describe('mapearCabecalho', () => {
  it('reconhece variações de nome e separa as colunas desconhecidas', () => {
    const cabecalho = mapearCabecalho(['Nº SEI', 'Órgão', 'Resumo', 'Técnico', 'Cor da pasta']);
    expect(cabecalho.indices).toEqual({ processoSei: 0, demandante: 1, assunto: 2, fiscal: 3 });
    expect(cabecalho.ignoradas).toEqual(['Cor da pasta']);
  });

  it('com duas colunas para o mesmo campo, usa a primeira', () => {
    const cabecalho = mapearCabecalho(['Órgão', 'Demandante', 'Assunto']);
    expect(cabecalho.indices.demandante).toBe(0);
    expect(cabecalho.ignoradas).toEqual(['Demandante']);
  });
});

describe('lerData', () => {
  it.each([
    ['03/11/2026', '2026-11-03'],
    ['3/11/26', '2026-11-03'],
    ['03-11-2026', '2026-11-03'],
    ['03.11.2026', '2026-11-03'],
    ['2026-11-03', '2026-11-03'],
    ['03/11/2026 00:00', '2026-11-03'],
  ])('entende "%s"', (texto, esperado) => {
    expect(lerData(texto)).toBe(esperado);
  });

  it('vazio é null; data impossível é inválida', () => {
    expect(lerData('  ')).toBeNull();
    expect(lerData('31/02/2026')).toBe('invalida');
    expect(lerData('amanhã')).toBe('invalida');
  });
});

describe('criarBusca', () => {
  const buscar = criarBusca(contexto().demandantes);

  it('encontra pelo nome completo, sem os parênteses ou só pela sigla', () => {
    for (const texto of ['Ministério Público do Trabalho (MPT)', 'ministerio publico do trabalho', 'MPT', 'mpt']) {
      expect(buscar(texto)).toEqual({ registro: { id: 1, nome: 'Ministério Público do Trabalho (MPT)' } });
    }
  });

  it('avisa quando não encontra ou quando mais de um cadastro bate', () => {
    expect(buscar('PRT 6ª Região')).toEqual({ erro: 'nao_encontrado' });
    const ambigua = criarBusca([
      { id: 1, nome: 'Vigilância Sanitária (VISA)' },
      { id: 2, nome: 'VISA' },
    ]);
    expect(ambigua('VISA')).toEqual({ erro: 'ambiguo' });
  });
});

describe('analisarPlanilha', () => {
  it('linha completa vira uma demanda pronta para gravar', () => {
    const linha = analisarUma(['25000.012345/2026-11', '03/11/2026', 'MPT', 'Inspeção em frigorífico', '03/12/2026', 'Carlos Melo', 'Em andamento']);
    expect(linha.erros).toEqual([]);
    expect(linha.linha).toBe(2);
    expect(linha.dados).toEqual({
      demandanteId: 1,
      fiscalId: 10,
      assunto: 'Inspeção em frigorífico',
      prazo: '2026-12-03',
      recebidaEm: '2026-11-03',
      processoSei: '25000.012345/2026-11',
      status: 'em_andamento',
    });
  });

  it('sem prazo, conta o prazo padrão a partir do RECEBIMENTO, não de hoje', () => {
    const linha = analisarUma(['', '01/11/2026', 'MPT', 'Laudo', '', '', '']);
    expect(linha.dados?.prazo).toBe(adicionarDias('2026-11-01', DIAS_PRAZO_PADRAO));
  });

  it('sem prazo e sem recebimento, conta a partir de hoje; situação vazia vira "aberta"', () => {
    const linha = analisarUma(['', '', 'MPT', 'Laudo', '', '', '']);
    expect(linha.dados).toMatchObject({ prazo: adicionarDias(HOJE, DIAS_PRAZO_PADRAO), recebidaEm: null, status: 'aberta' });
  });

  it('órgão ou fiscal desconhecido vira erro na linha, com a orientação', () => {
    const linha = analisarUma(['', '', 'PRT 6ª Região', 'Laudo', '', 'Fulano', '']);
    expect(linha.dados).toBeNull();
    expect(linha.erros).toEqual([
      'Órgão "PRT 6ª Região" não está cadastrado no Stante. Cadastre-o em Demandantes e importe de novo.',
      'Responsável "Fulano" não é um fiscal cadastrado. Deixe em branco ou corrija o nome.',
    ]);
  });

  it('demanda concluída não entra', () => {
    const linha = analisarUma(['', '', 'MPT', 'Laudo', '', '', 'Concluída']);
    expect(linha.dados).toBeNull();
    expect(linha.erros[0]).toMatch(/já concluída/);
  });

  it('aponta datas inválidas, recebimento no futuro e prazo antes do recebimento', () => {
    expect(analisarUma(['', '31/02/2026', 'MPT', 'Laudo', 'logo', '', '']).erros).toEqual([
      'Data de recebimento "31/02/2026" inválida. Use dd/mm/aaaa.',
      'Prazo "logo" inválido. Use dd/mm/aaaa ou deixe em branco.',
    ]);
    expect(analisarUma(['', '01/12/2026', 'MPT', 'Laudo', '', '', '']).erros).toContain('Data de recebimento no futuro.');
    expect(analisarUma(['', '10/11/2026', 'MPT', 'Laudo', '05/11/2026', '', '']).erros).toContain(
      'Prazo anterior à data de recebimento.',
    );
  });

  it('não deixa repetir processo, nem dentro da planilha nem com o que já está no Stante', () => {
    const analise = analisarPlanilha(
      [CABECALHO, ['111', '', 'MPT', 'A', '', '', ''], ['111', '', 'MPT', 'B', '', '', ''], ['222', '', 'MPT', 'C', '', '', '']],
      contexto({ processosExistentes: new Set(['222']) }),
    );
    expect(analise.linhas.map((l) => l.erros)).toEqual([
      [],
      ['Processo 111 repetido na planilha (já aparece na linha 2).'],
      ['Já existe uma demanda com o processo SEI 222.'],
    ]);
  });

  it('junta tipo e nº do documento antes do assunto e as observações depois', () => {
    const analise = analisarPlanilha(
      [
        ['Órgão', 'Tipo de documento', 'Nº do documento', 'Assunto', 'Observações'],
        ['MPT', 'Ofício', '123/2026', 'Inspeção', 'Ligar antes'],
      ],
      contexto(),
    );
    expect(analise.linhas[0]!.dados?.assunto).toBe('[Ofício 123/2026] Inspeção — Obs.: Ligar antes');
  });

  it('pula linhas vazias, mas o número da linha continua o da planilha', () => {
    const analise = analisarPlanilha([CABECALHO, [''], ['', '', 'MPT', 'Laudo', '', '', '']], contexto());
    expect(analise.linhas).toHaveLength(1);
    expect(analise.linhas[0]!.linha).toBe(3);
  });

  it('recusa o arquivo inteiro quando falta coluna obrigatória ou não há dados', () => {
    expect(() => analisarPlanilha([['Processo', 'Prazo'], ['1', '']], contexto())).toThrow(
      /coluna "Órgão demandante" e "Assunto"/,
    );
    expect(() => analisarPlanilha([CABECALHO], contexto())).toThrow(/nenhuma demanda/);
    expect(() => analisarPlanilha([], contexto())).toThrow(/vazio/);
  });
});
