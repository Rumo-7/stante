import { z } from 'zod';
import { dataIsoValida, diasParaPrazo } from './prazo';

/** Um parecer cobre até um ano: períodos maiores viram relatórios longos demais para a IA e para quem lê. */
export const DIAS_MAXIMOS_DO_PARECER = 366;

const dataObrigatoria = z
  .string({ required_error: 'Informe o período do parecer.' })
  .refine(dataIsoValida, 'Data inválida (use AAAA-MM-DD).');

export const periodoDoParecerSchema = z
  .object({ de: dataObrigatoria, ate: dataObrigatoria })
  .refine((p) => p.de <= p.ate, {
    message: 'A data inicial não pode ser depois da final.',
    path: ['ate'],
  })
  .refine((p) => diasParaPrazo(p.ate, p.de) + 1 <= DIAS_MAXIMOS_DO_PARECER, {
    message: 'O período do parecer pode ter no máximo um ano.',
    path: ['ate'],
  });

export type PeriodoDoParecer = z.infer<typeof periodoDoParecerSchema>;
