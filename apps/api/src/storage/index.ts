import path from 'node:path';
import { env } from '../env';
import type { Armazenamento } from './armazenamento';
import { ArmazenamentoDisco } from './disco';

export type { Armazenamento } from './armazenamento';

export const armazenamento: Armazenamento = new ArmazenamentoDisco(
  path.resolve(process.cwd(), env.UPLOAD_DIR),
);
