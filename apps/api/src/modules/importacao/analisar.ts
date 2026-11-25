// Regras da importação: de linhas de CSV para demandas prontas para gravar (ou para erros legíveis).
// Não acessa o banco: recebe órgãos, fiscais e processos já existentes no "contexto".
// Assim as regras são testadas sem Postgres, e a rota só cuida de buscar dados e gravar.

import { dataIsoValida, prazoPadrao } from '@stante/shared';
import { ErroHttp } from '../../http/erros';
import { linhaVazia } from './csv';

export const MAXIMO_LINHAS = 1000;
const TAMANHO_MAXIMO_ASSUNTO = 500;
const TAMANHO_MAXIMO_PROCESSO = 60;

// ---------------------------------------------------------------- textos

/** "Órgão  Demandante" -> "orgao demandante": compara sem acento, maiúsculas, pontuação ou espaços extras. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[º°ª]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const limpar = (valor: string | undefined) => (valor ?? '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- colunas

export type Campo =
  | 'processoSei'
  | 'recebidaEm'
  | 'demandante'
  | 'tipoDocumento'
  | 'numeroDocumento'
  | 'assunto'
  | 'prazo'
  | 'fiscal'
  | 'situacao'
  | 'observacoes';

/**
 * Nomes de coluna aceitos para cada campo (já normalizados). Cada planilha batiza as colunas
 * de um jeito; aqui ficam as variações mais prováveis. Para aceitar outra, é só acrescentar.
 */
const NOMES_DE_COLUNA: Record<Campo, string[]> = {
  processoSei: ['processo sei', 'processo', 'n processo', 'n do processo', 'numero do processo', 'n sei', 'numero sei', 'sei', 'nup'],
  recebidaEm: ['data de recebimento', 'recebimento', 'recebida em', 'recebido em', 'data de entrada', 'entrada', 'data'],
  demandante: ['orgao demandante', 'orgao', 'demandante', 'solicitante', 'orgao solicitante', 'origem'],
  tipoDocumento: ['tipo de documento', 'tipo do documento', 'tipo'],
  numeroDocumento: ['n do documento', 'numero do documento', 'n documento', 'numero documento', 'n oficio', 'oficio'],
  assunto: ['assunto', 'resumo', 'descricao', 'objeto'],
  prazo: ['prazo', 'prazo final', 'prazo limite', 'data limite', 'vencimento', 'data de vencimento'],
  fiscal: ['responsavel', 'fiscal', 'inspetor', 'tecnico', 'tecnico responsavel', 'fiscal responsavel'],
  situacao: ['situacao', 'status'],
  observacoes: ['observacoes', 'observacao', 'obs'],
};

export const ROTULO_CAMPO: Record<Campo, string> = {
  processoSei: 'Processo SEI',
  recebidaEm: 'Data de recebimento',
  demandante: 'Órgão demandante',
  tipoDocumento: 'Tipo de documento',
  numeroDocumento: 'Nº do documento',
  assunto: 'Assunto',
  prazo: 'Prazo',
  fiscal: 'Responsável',
  situacao: 'Situação',
  observacoes: 'Observações',
};

const OBRIGATORIOS: Campo[] = ['demandante', 'assunto'];

const CAMPO_POR_NOME = new Map<string, Campo>(
  (Object.entries(NOMES_DE_COLUNA) as [Campo, string[]][]).flatMap(([campo, nomes]) =>
    nomes.map((nome) => [nome, campo] as const),
  ),
);

export interface Cabecalho {
  /** Em qual posição da linha está cada campo reconhecido. */
  indices: Partial<Record<Campo, number>>;
  reconhecidas: { coluna: string; campo: Campo }[];
  ignoradas: string[];
}

export function mapearCabecalho(celulas: string[]): Cabecalho {
  const cabecalho: Cabecalho = { indices: {}, reconhecidas: [], ignoradas: [] };
  celulas.forEach((coluna, indice) => {
    const nome = limpar(coluna);
    if (!nome) return;
    const campo = CAMPO_POR_NOME.get(normalizar(nome));
    // Coluna desconhecida, ou um segundo nome para um campo já encontrado: fica de fora
    if (!campo || cabecalho.indices[campo] !== undefined) {
      cabecalho.ignoradas.push(nome);
      return;
    }
    cabecalho.indices[campo] = indice;
    cabecalho.reconhecidas.push({ coluna: nome, campo });
  });
  return cabecalho;
}

// ---------------------------------------------------------------- valores

/**
 * "03/11/2026", "3/11/26", "03-11-2026", "03.11.2026" ou "2026-11-03" -> "2026-11-03".
 * Ignora um horário depois da data ("03/11/2026 00:00", comum no Excel).
 * Devolve null para vazio e "invalida" quando não dá para entender.
 */
export function lerData(valor: string): string | null | 'invalida' {
  const texto = limpar(valor).split(' ')[0] ?? '';
  if (!texto) return null;

  let iso: string | null = null;
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(texto);
  if (br) {
    const [, dia, mes, ano] = br as unknown as [string, string, string, string];
    const anoCompleto = ano.length === 2 ? `20${ano}` : ano;
    iso = `${anoCompleto}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    iso = texto;
  }

  return iso && dataIsoValida(iso) ? iso : 'invalida';
}

type StatusImportavel = 'aberta' | 'em_andamento';

const SITUACOES: Record<string, StatusImportavel | 'concluida'> = {
  aberta: 'aberta',
  aberto: 'aberta',
  nova: 'aberta',
  novo: 'aberta',
  pendente: 'aberta',
  recebida: 'aberta',
  recebido: 'aberta',
  'a iniciar': 'aberta',
  'nao iniciada': 'aberta',
  'em andamento': 'em_andamento',
  andamento: 'em_andamento',
  'em execucao': 'em_andamento',
  'em atendimento': 'em_andamento',
  // Na planilha, "em análise" é alguém trabalhando nela; no Stante, em_analise é outra coisa
  // (registro de campo aguardando o gestor). Por isso vira "em andamento".
  'em analise': 'em_andamento',
  concluida: 'concluida',
  concluido: 'concluida',
  finalizada: 'concluida',
  finalizado: 'concluida',
  encerrada: 'concluida',
  encerrado: 'concluida',
  respondida: 'concluida',
  respondido: 'concluida',
  arquivada: 'concluida',
  arquivado: 'concluida',
};

// ---------------------------------------------------------------- busca por nome

interface Registro {
  id: number;
  nome: string;
}

type ResultadoBusca = { registro: Registro } | { erro: 'nao_encontrado' | 'ambiguo' };

/**
 * Procura um órgão ou fiscal pelo que está escrito na planilha. Aceita o nome completo,
 * o nome sem a parte entre parênteses ou só a sigla entre parênteses:
 * "Ministério Público do Trabalho (MPT)" é encontrado por "MPT" e por "ministerio publico do trabalho".
 */
export function criarBusca(registros: Registro[]): (texto: string) => ResultadoBusca {
  const porChave = new Map<string, Map<number, Registro>>();
  const indexar = (chave: string, registro: Registro) => {
    if (!chave) return;
    const lista = porChave.get(chave) ?? new Map<number, Registro>();
    lista.set(registro.id, registro);
    porChave.set(chave, lista);
  };

  for (const registro of registros) {
    indexar(normalizar(registro.nome), registro);
    indexar(normalizar(registro.nome.replace(/\([^)]*\)/g, '')), registro);
    for (const [, sigla] of registro.nome.matchAll(/\(([^)]+)\)/g)) indexar(normalizar(sigla ?? ''), registro);
  }

  return (texto) => {
    const encontrados = [...(porChave.get(normalizar(texto))?.values() ?? [])];
    if (encontrados.length === 1) return { registro: encontrados[0]! };
    return { erro: encontrados.length === 0 ? 'nao_encontrado' : 'ambiguo' };
  };
}

// ---------------------------------------------------------------- linhas

export interface ContextoImportacao {
  /** Hoje no fuso do negócio ("AAAA-MM-DD"). */
  hoje: string;
  demandantes: Registro[];
  fiscais: Registro[];
  /** Processos SEI que já têm demanda no Stante. */
  processosExistentes: Set<string>;
}

export interface DemandaImportada {
  demandanteId: number;
  fiscalId: number | null;
  assunto: string;
  prazo: string;
  recebidaEm: string | null;
  processoSei: string | null;
  status: StatusImportavel;
}

export interface LinhaAnalisada {
  /** Número da linha na planilha (o cabeçalho é a linha 1). */
  linha: number;
  erros: string[];
  /** O que mostrar na prévia: o valor resolvido quando deu certo, o texto da planilha quando não. */
  resumo: {
    processoSei: string | null;
    demandante: string;
    assunto: string;
    prazo: string | null;
    fiscal: string | null;
    situacao: string;
  };
  /** Pronto para gravar; só existe quando a linha não tem erros. */
  dados: DemandaImportada | null;
}

export interface Analise {
  cabecalho: Cabecalho;
  linhas: LinhaAnalisada[];
}

/** Valores da coluna "Processo SEI", para a rota buscar no banco quais já existem. */
export function processosDaPlanilha(linhas: string[][]): string[] {
  const indice = mapearCabecalho(linhas[0] ?? []).indices.processoSei;
  if (indice === undefined) return [];
  return linhas
    .slice(1)
    .map((celulas) => limpar(celulas[indice]))
    .filter(Boolean);
}

export function analisarPlanilha(linhas: string[][], contexto: ContextoImportacao): Analise {
  const [primeira, ...corpo] = linhas;
  if (!primeira || linhaVazia(primeira)) throw new ErroHttp(400, 'O arquivo está vazio.');

  const cabecalho = mapearCabecalho(primeira);
  const faltando = OBRIGATORIOS.filter((campo) => cabecalho.indices[campo] === undefined);
  if (faltando.length > 0) {
    const nomes = faltando.map((campo) => `"${ROTULO_CAMPO[campo]}"`).join(' e ');
    throw new ErroHttp(
      400,
      `A planilha precisa ter a coluna ${nomes}. Confira a primeira linha (cabeçalho) ou baixe o modelo.`,
    );
  }

  const comDados = corpo.map((celulas, i) => ({ celulas, linha: i + 2 })).filter(({ celulas }) => !linhaVazia(celulas));
  if (comDados.length === 0) throw new ErroHttp(400, 'A planilha não tem nenhuma demanda abaixo do cabeçalho.');
  if (comDados.length > MAXIMO_LINHAS) {
    throw new ErroHttp(400, `Importe no máximo ${MAXIMO_LINHAS} demandas por vez (a planilha tem ${comDados.length}).`);
  }

  const buscarDemandante = criarBusca(contexto.demandantes);
  const buscarFiscal = criarBusca(contexto.fiscais);
  // Processo -> primeira linha em que apareceu, para apontar repetições dentro da própria planilha
  const processosVistos = new Map<string, number>();

  const analisadas = comDados.map(({ celulas, linha }) => {
    const valor = (campo: Campo) => {
      const indice = cabecalho.indices[campo];
      return indice === undefined ? '' : limpar(celulas[indice]);
    };
    const erros: string[] = [];

    // Órgão
    const textoDemandante = valor('demandante');
    let demandante: Registro | null = null;
    if (!textoDemandante) {
      erros.push('Órgão demandante vazio.');
    } else {
      const achado = buscarDemandante(textoDemandante);
      if ('registro' in achado) demandante = achado.registro;
      else if (achado.erro === 'ambiguo') erros.push(`Órgão "${textoDemandante}" corresponde a mais de um cadastro; use o nome completo.`);
      else erros.push(`Órgão "${textoDemandante}" não está cadastrado no Stante. Cadastre-o em Demandantes e importe de novo.`);
    }

    // Fiscal (opcional)
    const textoFiscal = valor('fiscal');
    let fiscal: Registro | null = null;
    if (textoFiscal) {
      const achado = buscarFiscal(textoFiscal);
      if ('registro' in achado) fiscal = achado.registro;
      else if (achado.erro === 'ambiguo') erros.push(`Responsável "${textoFiscal}" corresponde a mais de um fiscal; use o nome completo.`);
      else erros.push(`Responsável "${textoFiscal}" não é um fiscal cadastrado. Deixe em branco ou corrija o nome.`);
    }

    // Situação
    const textoSituacao = valor('situacao');
    const situacao = textoSituacao ? SITUACOES[normalizar(textoSituacao)] : 'aberta';
    if (situacao === undefined) {
      erros.push(`Situação "${textoSituacao}" não reconhecida. Use "Aberta" ou "Em andamento".`);
    } else if (situacao === 'concluida') {
      erros.push('Demanda já concluída: só demandas em aberto são importadas, para não distorcer os indicadores.');
    }

    // Processo SEI (opcional, mas sem repetição)
    const processoSei = valor('processoSei') || null;
    if (processoSei) {
      const primeiraVez = processosVistos.get(processoSei);
      if (processoSei.length > TAMANHO_MAXIMO_PROCESSO) {
        erros.push(`Processo SEI com mais de ${TAMANHO_MAXIMO_PROCESSO} caracteres.`);
      } else if (primeiraVez !== undefined) {
        erros.push(`Processo ${processoSei} repetido na planilha (já aparece na linha ${primeiraVez}).`);
      } else if (contexto.processosExistentes.has(processoSei)) {
        erros.push(`Já existe uma demanda com o processo SEI ${processoSei}.`);
      }
      if (primeiraVez === undefined) processosVistos.set(processoSei, linha);
    }

    // Datas
    const recebidaEm = lerData(valor('recebidaEm'));
    if (recebidaEm === 'invalida') erros.push(`Data de recebimento "${valor('recebidaEm')}" inválida. Use dd/mm/aaaa.`);
    else if (recebidaEm && recebidaEm > contexto.hoje) erros.push('Data de recebimento no futuro.');
    const base = recebidaEm && recebidaEm !== 'invalida' ? recebidaEm : null;

    const prazoLido = lerData(valor('prazo'));
    let prazo: string | null = null;
    if (prazoLido === 'invalida') {
      erros.push(`Prazo "${valor('prazo')}" inválido. Use dd/mm/aaaa ou deixe em branco.`);
    } else {
      // Sem prazo, vale o padrão contado a partir do RECEBIMENTO (e não do dia da importação)
      prazo = prazoLido ?? prazoPadrao(base ?? contexto.hoje);
      if (base && prazo < base) erros.push('Prazo anterior à data de recebimento.');
    }

    // Assunto: o texto da planilha, com a referência do documento antes e as observações depois
    const textoAssunto = valor('assunto');
    const referencia = [valor('tipoDocumento'), valor('numeroDocumento')].filter(Boolean).join(' ');
    const observacoes = valor('observacoes');
    let assunto = textoAssunto;
    if (referencia) assunto = `[${referencia}] ${assunto}`;
    if (observacoes) assunto = `${assunto} — Obs.: ${observacoes}`;
    if (!textoAssunto) {
      erros.push('Assunto vazio.');
    } else if (assunto.length > TAMANHO_MAXIMO_ASSUNTO) {
      erros.push(
        `Assunto muito longo: com tipo, nº do documento e observações ficou com ${assunto.length} caracteres (máximo ${TAMANHO_MAXIMO_ASSUNTO}).`,
      );
    }

    const resultado: LinhaAnalisada = {
      linha,
      erros,
      resumo: {
        processoSei,
        demandante: demandante?.nome ?? textoDemandante,
        assunto: assunto || textoAssunto,
        prazo,
        fiscal: fiscal?.nome ?? (textoFiscal || null),
        situacao: textoSituacao || 'Aberta',
      },
      dados: null,
    };

    if (erros.length === 0 && demandante && prazo && (situacao === 'aberta' || situacao === 'em_andamento')) {
      resultado.dados = {
        demandanteId: demandante.id,
        fiscalId: fiscal?.id ?? null,
        assunto,
        prazo,
        recebidaEm: base,
        processoSei,
        status: situacao,
      };
    }
    return resultado;
  });

  return { cabecalho, linhas: analisadas };
}
