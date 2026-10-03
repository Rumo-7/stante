import { z } from 'zod';
import { TIPOS_DEMANDANTE } from './demandante';

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

const nomeDoOrgao = z
  .string({ required_error: 'Informe o nome do órgão.' })
  .trim()
  .min(1, 'Informe o nome do órgão.')
  .max(200, 'O nome deve ter no máximo 200 caracteres.');

const categoriaDoOrgao = z.enum(TIPOS_DEMANDANTE, { errorMap: () => ({ message: 'Categoria inválida.' }) });

/** A categoria só vale quando quem cria é o gestor; sem ela, o órgão entra como "outro". */
export const criarDemandanteSchema = z.object({
  nome: nomeDoOrgao,
  tipo: categoriaDoOrgao.optional(),
});

export const atualizarDemandanteSchema = z
  .object({
    nome: nomeDoOrgao.optional(),
    tipo: categoriaDoOrgao.optional(),
  })
  .refine((dados) => dados.nome !== undefined || dados.tipo !== undefined, {
    message: 'Nada para atualizar.',
  });

export type CriarFiscalInput = z.infer<typeof criarFiscalSchema>;
export type CriarDemandanteInput = z.infer<typeof criarDemandanteSchema>;
export type AtualizarDemandanteInput = z.infer<typeof atualizarDemandanteSchema>;
