import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { Armazenamento } from './armazenamento';

export class ArmazenamentoDisco implements Armazenamento {
  constructor(private readonly pasta: string) {}

  async salvar(chave: string, conteudo: Buffer) {
    await fs.mkdir(this.pasta, { recursive: true });
    // flag "wx": nunca sobrescreve um arquivo que já exista
    await fs.writeFile(this.caminho(chave), conteudo, { flag: 'wx' });
  }

  async existe(chave: string) {
    try {
      await fs.access(this.caminho(chave));
      return true;
    } catch {
      return false;
    }
  }

  abrir(chave: string): Readable {
    return createReadStream(this.caminho(chave));
  }

  async remover(chave: string) {
    await fs.rm(this.caminho(chave), { force: true });
  }

  private caminho(chave: string) {
    // As chaves são geradas por nós (uuid + extensão); isto barra qualquer
    // tentativa de sair da pasta se um dia uma chave vier de fora.
    if (chave !== path.basename(chave) || chave.startsWith('.')) {
      throw new Error('Chave de arquivo inválida.');
    }
    return path.join(this.pasta, chave);
  }
}
