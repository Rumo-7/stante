import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TZ_NEGOCIO: z.string().default('America/Recife'),
  // Pasta dos anexos quando o armazenamento é em disco (relativa a apps/api)
  UPLOAD_DIR: z.string().default('uploads'),
});

const resultado = schema.safeParse(process.env);

if (!resultado.success) {
  const problemas = resultado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  console.error(`Variáveis de ambiente inválidas:\n${problemas.join('\n')}`);
  process.exit(1);
}

export const env = resultado.data;
