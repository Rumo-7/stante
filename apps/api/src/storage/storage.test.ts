import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { esquemaEnv } from '../env';
import { validarChave } from './armazenamento';
import { ArmazenamentoDisco } from './disco';
import { ArmazenamentoS3, type ClienteS3 } from './s3';

/** Cliente falso: guarda os comandos enviados e responde o que o teste mandar. */
function clienteFalso(resposta: (comando: unknown) => unknown = () => ({})) {
  const enviados: unknown[] = [];
  const cliente: ClienteS3 = {
    async send(comando) {
      enviados.push(comando);
      const r = resposta(comando);
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { cliente, enviados };
}

describe('ArmazenamentoS3', () => {
  it('salva no bucket certo, com a chave e o conteúdo', async () => {
    const { cliente, enviados } = clienteFalso();
    await new ArmazenamentoS3(cliente, 'meu-bucket').salvar('abc-123.pdf', Buffer.from('conteudo'));

    const comando = enviados[0] as PutObjectCommand;
    expect(comando).toBeInstanceOf(PutObjectCommand);
    expect(comando.input).toMatchObject({ Bucket: 'meu-bucket', Key: 'abc-123.pdf' });
    expect((comando.input.Body as Buffer).toString()).toBe('conteudo');
  });

  it('existe: true quando o objeto está lá, false quando o bucket diz que não existe', async () => {
    const existente = clienteFalso();
    expect(await new ArmazenamentoS3(existente.cliente, 'b').existe('a.pdf')).toBe(true);
    expect(existente.enviados[0]).toBeInstanceOf(HeadObjectCommand);

    for (const erro of [
      Object.assign(new Error('x'), { name: 'NotFound' }),
      Object.assign(new Error('x'), { name: 'NoSuchKey' }),
      Object.assign(new Error('x'), { $metadata: { httpStatusCode: 404 } }),
    ]) {
      const ausente = clienteFalso(() => erro);
      expect(await new ArmazenamentoS3(ausente.cliente, 'b').existe('a.pdf')).toBe(false);
    }
  });

  it('existe: falha de rede ou de permissão NÃO vira "arquivo não existe"', async () => {
    const semPermissao = clienteFalso(() => Object.assign(new Error('Forbidden'), { $metadata: { httpStatusCode: 403 } }));
    await expect(new ArmazenamentoS3(semPermissao.cliente, 'b').existe('a.pdf')).rejects.toThrow('Forbidden');
  });

  it('abre devolvendo o fluxo de leitura do objeto', async () => {
    const { cliente, enviados } = clienteFalso(() => ({ Body: Readable.from(['ola']) }));
    const fluxo = await new ArmazenamentoS3(cliente, 'b').abrir('a.pdf');

    expect(enviados[0]).toBeInstanceOf(GetObjectCommand);
    const pedacos: Buffer[] = [];
    for await (const pedaco of fluxo) pedacos.push(Buffer.from(pedaco));
    expect(Buffer.concat(pedacos).toString()).toBe('ola');
  });

  it('abrir sem corpo na resposta é erro', async () => {
    const { cliente } = clienteFalso(() => ({}));
    await expect(new ArmazenamentoS3(cliente, 'b').abrir('a.pdf')).rejects.toThrow(/sem conteúdo/);
  });

  it('remove o objeto', async () => {
    const { cliente, enviados } = clienteFalso();
    await new ArmazenamentoS3(cliente, 'b').remover('a.pdf');
    expect(enviados[0]).toBeInstanceOf(DeleteObjectCommand);
    expect((enviados[0] as DeleteObjectCommand).input).toMatchObject({ Bucket: 'b', Key: 'a.pdf' });
  });

  it('recusa chaves que tentam sair do lugar, sem nem chamar o bucket', async () => {
    const { cliente, enviados } = clienteFalso();
    const armazenamento = new ArmazenamentoS3(cliente, 'b');
    for (const chave of ['../segredo', 'a/b.pdf', '.env', '', 'a b.pdf']) {
      await expect(armazenamento.salvar(chave, Buffer.from('x')), chave).rejects.toThrow('Chave de arquivo inválida.');
      await expect(armazenamento.abrir(chave), chave).rejects.toThrow('Chave de arquivo inválida.');
    }
    expect(enviados).toHaveLength(0);
  });
});

describe('validarChave', () => {
  it('aceita o formato que o sistema gera (uuid + extensão)', () => {
    expect(() => validarChave('0b1f6a52-3c1e-4f0a-9d6e-7a1b2c3d4e5f.pdf')).not.toThrow();
    expect(() => validarChave('0b1f6a52-3c1e-4f0a-9d6e-7a1b2c3d4e5f.docx')).not.toThrow();
  });
});

describe('ArmazenamentoDisco', () => {
  it('também recusa chaves fora do padrão', async () => {
    const disco = new ArmazenamentoDisco('/tmp/stante-nunca-usado');
    await expect(disco.salvar('../fora.pdf', Buffer.from('x'))).rejects.toThrow('Chave de arquivo inválida.');
    await expect(disco.existe('a/b.pdf')).rejects.toThrow('Chave de arquivo inválida.');
  });
});

describe('configuração do armazenamento (env)', () => {
  const base = { DATABASE_URL: 'postgresql://x@localhost/x' };
  const s3Completo = {
    STORAGE_DRIVER: 's3',
    S3_ENDPOINT: 'https://conta.r2.cloudflarestorage.com',
    S3_BUCKET: 'stante-anexos',
    S3_ACCESS_KEY_ID: 'chave',
    S3_SECRET_ACCESS_KEY: 'segredo',
  };

  it('desenvolvimento usa disco por padrão', () => {
    const r = esquemaEnv.parse({ ...base, NODE_ENV: 'development' });
    expect(r.STORAGE_DRIVER).toBe('disco');
  });

  it('com s3, exige todos os dados do bucket e diz quais faltam', () => {
    const r = esquemaEnv.safeParse({ ...base, STORAGE_DRIVER: 's3' });
    expect(r.success).toBe(false);
    const faltando = r.error!.issues.map((i) => i.path[0]);
    expect(faltando).toEqual(['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']);
  });

  it('produção com disco é recusada (o disco do servidor é descartável)', () => {
    const r = esquemaEnv.safeParse({ ...base, NODE_ENV: 'production' });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.message).toMatch(/STORAGE_DRIVER=s3/);
  });

  it('produção com s3 completo é aceita', () => {
    const r = esquemaEnv.safeParse({ ...base, ...s3Completo, NODE_ENV: 'production' });
    expect(r.success).toBe(true);
  });

  it('o endpoint precisa ser uma URL', () => {
    const r = esquemaEnv.safeParse({ ...base, ...s3Completo, S3_ENDPOINT: 'conta.r2.cloudflarestorage.com' });
    expect(r.success).toBe(false);
  });
});
