/** Maior valor de um INT4 do PostgreSQL: o tipo das chaves primárias (`Int` no Prisma). */
export const MAX_INT32 = 2_147_483_647;

/**
 * Diz se o número serve como ID de registro: inteiro, positivo e dentro do INT4.
 * Um ID fora disso não existe no banco, e passá-lo ao Prisma daria erro de conversão.
 */
export function ehIdValido(id: number): boolean {
  return Number.isInteger(id) && id > 0 && id <= MAX_INT32;
}
