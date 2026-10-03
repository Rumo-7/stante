import { z } from 'zod';

export const PERFIS = ['gestor', 'inspetor', 'representante'] as const;
export type Perfil = (typeof PERFIS)[number];

const email = z
  .string({ required_error: 'Preencha email e senha.' })
  .trim()
  .toLowerCase()
  .email('Informe um e-mail válido.')
  .max(254);

export const loginSchema = z.object({
  email,
  senha: z
    .string({ required_error: 'Preencha email e senha.' })
    .min(1, 'Preencha email e senha.')
    .max(200),
});

// 72 bytes é o limite do bcrypt; acima disso a senha seria truncada em silêncio.
export const cadastroSchema = z
  .object({
    nome: z
      .string({ required_error: 'Preencha todos os campos.' })
      .trim()
      .min(2, 'Informe o nome.')
      .max(120),
    email,
    senha: z
      .string({ required_error: 'Preencha todos os campos.' })
      .min(8, 'A senha deve ter pelo menos 8 caracteres.')
      .max(72, 'A senha deve ter no máximo 72 caracteres.'),
    confirmarSenha: z.string({ required_error: 'Preencha todos os campos.' }),
    perfil: z.enum(PERFIS, {
      errorMap: () => ({ message: 'Perfil inválido.' }),
    }),
  })
  .refine((dados) => dados.senha === dados.confirmarSenha, {
    message: 'As senhas não coincidem.',
    path: ['confirmarSenha'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type CadastroInput = z.infer<typeof cadastroSchema>;
