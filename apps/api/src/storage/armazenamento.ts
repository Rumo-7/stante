import type { Readable } from 'node:stream';

/**
 * Onde os arquivos dos anexos ficam guardados. O resto do código só conhece
 * esta interface: em desenvolvimento é a pasta local; para produção, onde o
 * disco é descartável, entra uma implementação para um bucket (ex.: R2)
 * sem tocar nas rotas.
 */
export interface Armazenamento {
  salvar(chave: string, conteudo: Buffer): Promise<void>;
  existe(chave: string): Promise<boolean>;
  abrir(chave: string): Readable;
  remover(chave: string): Promise<void>;
}
