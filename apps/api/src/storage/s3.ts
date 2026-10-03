import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { validarChave, type Armazenamento } from './armazenamento';

/** O pedaço do cliente S3 que usamos: facilita trocar por um falso nos testes. */
export interface ClienteS3 {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(comando: any): Promise<any>;
}

/** Bucket S3-compatível (Cloudflare R2, Backblaze B2, AWS S3, MinIO...). O bucket deve ser privado. */
export class ArmazenamentoS3 implements Armazenamento {
  constructor(
    private readonly cliente: ClienteS3,
    private readonly bucket: string,
  ) {}

  async salvar(chave: string, conteudo: Buffer) {
    validarChave(chave);
    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: chave,
        Body: conteudo,
        // O tipo real fica no banco; no bucket o arquivo é opaco
        ContentType: 'application/octet-stream',
      }),
    );
  }

  async existe(chave: string) {
    validarChave(chave);
    try {
      await this.cliente.send(new HeadObjectCommand({ Bucket: this.bucket, Key: chave }));
      return true;
    } catch (erro) {
      const e = erro as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw erro; // falha de rede ou de permissão não pode virar "arquivo não existe"
    }
  }

  async abrir(chave: string): Promise<Readable> {
    validarChave(chave);
    const resposta = await this.cliente.send(new GetObjectCommand({ Bucket: this.bucket, Key: chave }));
    if (!resposta.Body) throw new Error('Resposta do bucket sem conteúdo.');
    return resposta.Body as Readable;
  }

  async remover(chave: string) {
    validarChave(chave);
    await this.cliente.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: chave }));
  }
}
