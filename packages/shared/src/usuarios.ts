import { z } from 'zod';
import { PERFIS } from './auth';
import { idOpcional } from './ids';

export const STATUS_USUARIO = ['pendente', 'ativo', 'bloqueado'] as const;
export type StatusUsuario = (typeof STATUS_USUARIO)[number];

export const listarUsuariosQuerySchema = z.object({
  status: z.preprocess(
    (valor) => (valor === '' ? undefined : valor),
    z.enum(STATUS_USUARIO, { errorMap: () => ({ message: 'Status inválido.' }) }).optional(),
  ),
});

/** O que o gestor pode alterar numa conta. "pendente" não é escolha: é o estado de quem acabou de se cadastrar. */
export const atualizarUsuarioSchema = z
  .object({
    status: z.enum(['ativo', 'bloqueado'], { errorMap: () => ({ message: 'Status inválido.' }) }).optional(),
    perfil: z.enum(PERFIS, { errorMap: () => ({ message: 'Perfil inválido.' }) }).optional(),
    /** Só para inspetores: o fiscal que corresponde a este usuário. null remove o vínculo. */
    fiscalId: idOpcional,
    /** Só para representantes: o órgão que eles acompanham. null remove o vínculo. */
    demandanteId: idOpcional,
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: 'Nada para atualizar.',
  });

export type AtualizarUsuarioInput = z.infer<typeof atualizarUsuarioSchema>;
