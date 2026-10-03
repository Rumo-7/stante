import { S3Client } from '@aws-sdk/client-s3';
import path from 'node:path';
import { env } from '../env';
import type { Armazenamento } from './armazenamento';
import { ArmazenamentoDisco } from './disco';
import { ArmazenamentoS3 } from './s3';

export type { Armazenamento } from './armazenamento';

function criarArmazenamento(): Armazenamento {
  if (env.STORAGE_DRIVER === 's3') {
    const cliente = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
      // Os checksums extras que o SDK novo envia por padrão nem todo serviço S3-compatível aceita (R2 incluso)
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return new ArmazenamentoS3(cliente, env.S3_BUCKET!);
  }

  return new ArmazenamentoDisco(path.resolve(process.cwd(), env.UPLOAD_DIR));
}

export const armazenamento: Armazenamento = criarArmazenamento();
