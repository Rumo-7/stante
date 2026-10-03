import { z } from 'zod';

const CAMPOS_S3 = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;

export const esquemaEnv = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
    PORT: z.coerce.number().int().positive().default(4000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    TZ_NEGOCIO: z.string().default('America/Recife'),

    // Onde ficam os anexos: pasta local (desenvolvimento) ou bucket S3-compatível (produção)
    STORAGE_DRIVER: z.enum(['disco', 's3']).default('disco'),
    UPLOAD_DIR: z.string().default('uploads'), // relativa a apps/api; só para STORAGE_DRIVER=disco
    S3_ENDPOINT: z.string().url('S3_ENDPOINT deve ser uma URL (https://...)').optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_REGION: z.string().default('auto'),

    // Pareceres com IA (Groq). Sem a chave, a tela de relatórios avisa que o recurso não está configurado.
    // Vazio ou ainda com o texto de exemplo (COLE_...) vale como "não configurado": a Sentinela avisa isso
    GROQ_API_KEY: z
      .string()
      .optional()
      .transform((valor) => {
        const chave = valor?.trim();
        return chave && !chave.startsWith('COLE_') ? chave : undefined;
      }),
    // Os modelos gratuitos mudam com frequência: confira a lista atual em console.groq.com
    GROQ_MODEL: z.string().min(1).default('openai/gpt-oss-120b'),
    // Nome da unidade que assina os pareceres
    UNIDADE_NOME: z.string().min(1).default('VISAT/CEREST Recife'),
  })
  .superRefine((valores, contexto) => {
    if (valores.STORAGE_DRIVER === 's3') {
      for (const campo of CAMPOS_S3) {
        if (!valores[campo]) {
          contexto.addIssue({
            code: 'custom',
            path: [campo],
            message: `${campo} é obrigatória com STORAGE_DRIVER=s3`,
          });
        }
      }
    }
    if (valores.NODE_ENV === 'production' && valores.STORAGE_DRIVER === 'disco') {
      contexto.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message: 'Em produção use STORAGE_DRIVER=s3: o disco do servidor é apagado a cada deploy.',
      });
    }
  });

const resultado = esquemaEnv.safeParse(process.env);

if (!resultado.success) {
  const problemas = resultado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  console.error(`Variáveis de ambiente inválidas:\n${problemas.join('\n')}`);
  process.exit(1);
}

export const env = resultado.data;
