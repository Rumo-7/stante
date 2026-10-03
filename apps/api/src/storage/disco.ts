import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { validarChave, type Armazenamento } from './armazenamento';

export class ArmazenamentoDisco implements Armazenamento {
  constructor(private readonly pasta: string) {}

  async salvar(chave: string, conteudo: Buffer) {
    await fs.mkdir(this.pasta, { recursive: true });
    // flag "wx": nunca sobrescreve um arquivo que já exista
    await fs.writeFile(this.caminho(chave), conteudo, { flag: 'wx' });
  }

  async existe(chave: string) {
    const caminho = this.caminho(chave); // fora do try: chave inválida é erro, não "não existe"
    try {
      await fs.access(caminho);
      return true;
    } catch {
      return false;
    }
  }

  async abrir(chave: string): Promise<Readable> {
    return createReadStream(this.caminho(chave));
  }

  async remover(chave: string) {
    await fs.rm(this.caminho(chave), { force: true });
  }

  private caminho(chave: string) {
    validarChave(chave);
    return path.join(this.pasta, chave);
  }
}
