import { z } from 'zod';

/**
 * Identificador vindo de formulário ou JSON: aceita número, texto numérico,
 * "" (vira null, "sem vínculo") e null. Ausente (undefined) significa "não alterar".
 */
export const idOpcional = z.preprocess(
  (valor) => {
    if (valor === '') return null;
    if (typeof valor === 'string' && valor.trim() !== '') return Number(valor);
    return valor;
  },
  z.number({ invalid_type_error: 'Identificador inválido.' }).int().positive('Identificador inválido.').nullable().optional(),
);
