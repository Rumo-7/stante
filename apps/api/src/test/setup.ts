import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const arquivoEnv = path.resolve(__dirname, '..', '..', '.env.test');

try {
  process.loadEnvFile(arquivoEnv);
} catch {
  throw new Error(
    'apps/api/.env.test não encontrado. Copie .env.test.example para .env.test e crie o banco stante_test.',
  );
}

// Anexos dos testes vão para uma pasta temporária, nunca para apps/api/uploads
process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), 'stante-test-uploads-'));

// Trava de segurança: os testes apagam tabelas inteiras.
const url = process.env.DATABASE_URL ?? '';
if (!/\/[^/?]*test[^/?]*(\?|$)/.test(url)) {
  throw new Error(`DATABASE_URL não parece de teste (${url.replace(/\/\/.*@/, '//***@')}). Abortando.`);
}
