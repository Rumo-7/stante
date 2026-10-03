import type { z } from 'zod';
import { ErroHttp } from './erros';

/** Valida `dados` com o schema; em caso de falha responde 400 com a primeira mensagem. */
export function validar<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, dados: unknown): T {
  const resultado = schema.safeParse(dados ?? {});
  if (!resultado.success) {
    throw new ErroHttp(400, resultado.error.issues[0]?.message ?? 'Dados inválidos.');
  }
  return resultado.data;
}
