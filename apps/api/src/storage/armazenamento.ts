import type { Readable } from 'node:stream';

/**
 * Onde os arquivos dos anexos ficam guardados. O resto do código só conhece
 * esta interface: em desenvolvimento é a pasta local; em produção, onde o
 * disco do servidor é descartável, é um bucket S3-compatível (ex.: Cloudflare R2).
 */
export interface Armazenamento {
  salvar(chave: string, conteudo: Buffer): Promise<void>;
  existe(chave: string): Promise<boolean>;
  abrir(chave: string): Promise<Readable>;
  remover(chave: string): Promise<void>;
}

/**
 * As chaves são geradas por nós (uuid + extensão). Isto barra qualquer tentativa
 * de sair da pasta (ou de "subpastas" do bucket) se um dia uma chave vier de fora.
 */
export function validarChave(chave: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(chave)) {
    throw new Error('Chave de arquivo inválida.');
  }
}
