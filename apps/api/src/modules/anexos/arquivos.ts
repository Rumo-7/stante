import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ErroHttp } from '../../http/erros';
import { armazenamento } from '../../storage';

export const TAMANHO_MAXIMO = 10 * 1024 * 1024;
export const MAXIMO_ARQUIVOS = 10;

const MSG_TIPO = 'Tipo de arquivo não permitido. Envie apenas PDF, DOC ou DOCX.';

export interface ArquivoValidado {
  nomeOriginal: string;
  mimeType: string;
  tamanho: number;
  conteudo: Buffer;
  /** Nome no armazenamento: gerado por nós, nunca derivado do que o cliente enviou. */
  chave: string;
}

interface TipoDetectado {
  mimeType: string;
  extensao: string;
}

/**
 * Descobre o tipo olhando os primeiros bytes. O mimetype e a extensão que o
 * cliente declara são livres para qualquer um forjar, então não valem como prova.
 */
function detectarTipo(conteudo: Buffer): TipoDetectado | null {
  if (conteudo.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { mimeType: 'application/pdf', extensao: '.pdf' };
  }
  // .doc antigo: contêiner OLE2
  if (conteudo.subarray(0, 8).equals(Buffer.from('D0CF11E0A1B11AE1', 'hex'))) {
    return { mimeType: 'application/msword', extensao: '.doc' };
  }
  // .docx: arquivo ZIP que contém a pasta "word/" (os nomes ficam em texto puro no ZIP)
  if (conteudo.subarray(0, 4).equals(Buffer.from('504b0304', 'hex')) && conteudo.includes('word/')) {
    return {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extensao: '.docx',
    };
  }
  return null;
}

function limparNome(original: string): string {
  // O parser de upload entrega o nome como latin1; se for só isso, refaz a leitura em UTF-8
  let nome = original;
  if (/^[\x00-\xFF]*$/.test(original)) {
    const reinterpretado = Buffer.from(original, 'latin1').toString('utf8');
    if (!reinterpretado.includes('�')) nome = reinterpretado;
  }

  nome = nome
    .split(/[\\/]/)
    .pop()! // só o último pedaço: descarta qualquer caminho
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();

  if (nome.length > 200) {
    const extensao = path.extname(nome);
    nome = nome.slice(0, 200 - extensao.length) + extensao;
  }
  return nome || 'arquivo';
}

export function validarArquivos(arquivos: Express.Multer.File[]): ArquivoValidado[] {
  return arquivos.map((arquivo) => {
    const tipo = detectarTipo(arquivo.buffer);
    if (!tipo) throw new ErroHttp(400, MSG_TIPO);
    return {
      nomeOriginal: limparNome(arquivo.originalname),
      mimeType: tipo.mimeType,
      tamanho: arquivo.size,
      conteudo: arquivo.buffer,
      chave: `${randomUUID()}${tipo.extensao}`,
    };
  });
}

/** Grava todos; se algum falhar, remove os que já tinham sido gravados. */
export async function gravarArquivos(arquivos: ArquivoValidado[]): Promise<void> {
  const gravados: ArquivoValidado[] = [];
  try {
    for (const arquivo of arquivos) {
      await armazenamento.salvar(arquivo.chave, arquivo.conteudo);
      gravados.push(arquivo);
    }
  } catch (erro) {
    await descartarArquivos(gravados);
    throw erro;
  }
}

export async function descartarArquivos(arquivos: { chave: string }[]): Promise<void> {
  await Promise.allSettled(arquivos.map((arquivo) => armazenamento.remover(arquivo.chave)));
}

/** Formato de criação aninhada do Prisma (`anexos: { create: [...] }`). */
export const paraCriacao = (arquivos: ArquivoValidado[], enviadoPorId: number) =>
  arquivos.map((arquivo) => ({
    nomeOriginal: arquivo.nomeOriginal,
    chaveArquivo: arquivo.chave,
    mimeType: arquivo.mimeType,
    tamanho: arquivo.tamanho,
    enviadoPorId,
  }));
