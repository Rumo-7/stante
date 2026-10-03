import { z } from 'zod';
import { dataIsoValida, STATUS_EXIBICAO } from './prazo';

const MSG_OBRIGATORIOS = 'Preencha demandante, assunto e prazo.';

/**
 * Identificador vindo de formulário ou JSON: aceita número, texto numérico,
 * "" (vira null, "sem fiscal") e null. Ausente (undefined) significa "não alterar".
 */
const idOpcional = z.preprocess(
  (valor) => {
    if (valor === '') return null;
    if (typeof valor === 'string' && valor.trim() !== '') return Number(valor);
    return valor;
  },
  z.number({ invalid_type_error: 'Identificador inválido.' }).int().positive('Identificador inválido.').nullable().optional(),
);

const idObrigatorio = (mensagemInvalido: string) =>
  z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor),
    z
      .number({ required_error: MSG_OBRIGATORIOS, invalid_type_error: mensagemInvalido })
      .int(mensagemInvalido)
      .positive(mensagemInvalido),
  );

const prazo = z
  .string({ required_error: MSG_OBRIGATORIOS, invalid_type_error: 'Informe um prazo válido (AAAA-MM-DD).' })
  .refine(dataIsoValida, 'Informe um prazo válido (AAAA-MM-DD).');

const assunto = z
  .string({ required_error: MSG_OBRIGATORIOS })
  .trim()
  .min(1, MSG_OBRIGATORIOS)
  .max(500, 'O assunto deve ter no máximo 500 caracteres.');

/** Status que podem ser definidos manualmente. "em_analise" só sai via validação do gestor. */
export const STATUS_EDITAVEIS = ['aberta', 'em_andamento', 'concluida'] as const;

export const criarDemandaSchema = z.object({
  demandanteId: idObrigatorio('Demandante inválido.'),
  assunto,
  fiscalId: idOpcional,
  prazo,
});

export const atualizarDemandaSchema = z
  .object({
    status: z.enum(STATUS_EDITAVEIS, { errorMap: () => ({ message: 'Status inválido.' }) }).optional(),
    fiscalId: idOpcional,
    prazo: prazo.optional(),
    assunto: assunto.optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: 'Nada para atualizar.',
  });

export const validarDemandaSchema = z.object({
  fiscalId: idOpcional,
  prazo: prazo.optional(),
});

const vazioParaUndefined = (valor: unknown) => (valor === '' ? undefined : valor);
const dataOpcional = z.preprocess(
  vazioParaUndefined,
  z.string().refine(dataIsoValida, 'Data inválida (use AAAA-MM-DD).').optional(),
);

export const listarDemandasQuerySchema = z.object({
  de: dataOpcional,
  ate: dataOpcional,
  status: z.preprocess(
    vazioParaUndefined,
    z.enum(STATUS_EXIBICAO, { errorMap: () => ({ message: 'Status inválido.' }) }).optional(),
  ),
  busca: z.preprocess(vazioParaUndefined, z.string().trim().max(100).optional()),
  fiscalId: z.preprocess(
    vazioParaUndefined,
    z.coerce.number({ invalid_type_error: 'Fiscal inválido.' }).int().positive('Fiscal inválido.').optional(),
  ),
  // "recentes" ordena pelas últimas cadastradas (padrão: pelo prazo, mais próximo primeiro)
  ordenar: z.preprocess(
    vazioParaUndefined,
    z.enum(['prazo', 'recentes'], { errorMap: () => ({ message: 'Ordenação inválida.' }) }).optional(),
  ),
  limite: z.preprocess(
    vazioParaUndefined,
    z.coerce
      .number({ invalid_type_error: 'Limite inválido.' })
      .int('Limite inválido.')
      .min(1, 'Limite inválido.')
      .max(500, 'O limite máximo é 500.')
      .optional(),
  ),
});

export type CriarDemandaInput = z.infer<typeof criarDemandaSchema>;
export type AtualizarDemandaInput = z.infer<typeof atualizarDemandaSchema>;
export type ValidarDemandaInput = z.infer<typeof validarDemandaSchema>;
export type ListarDemandasQuery = z.infer<typeof listarDemandasQuerySchema>;
