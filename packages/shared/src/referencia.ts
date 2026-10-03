import { z } from 'zod';

export const criarFiscalSchema = z.object({
  nome: z
    .string({ required_error: 'Informe o nome do fiscal.' })
    .trim()
    .min(1, 'Informe o nome do fiscal.')
    .max(120, 'O nome deve ter no máximo 120 caracteres.'),
  especialidade: z
    .string()
    .trim()
    .max(120, 'A especialidade deve ter no máximo 120 caracteres.')
    .optional()
    .transform((valor) => valor || null),
});

export const criarDemandanteSchema = z.object({
  nome: z
    .string({ required_error: 'Informe o nome do órgão.' })
    .trim()
    .min(1, 'Informe o nome do órgão.')
    .max(200, 'O nome deve ter no máximo 200 caracteres.'),
});

export type CriarFiscalInput = z.infer<typeof criarFiscalSchema>;
export type CriarDemandanteInput = z.infer<typeof criarDemandanteSchema>;
