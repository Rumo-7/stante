import type { Perfil } from '@stante/shared';
import type { Prisma, TipoDemandante } from '@prisma/client';
import { COOKIE_SESSAO, criarSessao } from '../auth/sessao';
import { prisma } from '../db';

export async function limparBanco() {
  await prisma.anexo.deleteMany();
  await prisma.demanda.deleteMany();
  await prisma.fiscal.deleteMany();
  await prisma.demandante.deleteMany();
  await prisma.sessao.deleteMany();
  await prisma.user.deleteMany();
}

let contador = 0;

/** Cria um usuário ativo e já devolve o cookie de uma sessão válida (sem passar pelo bcrypt). */
export async function criarUsuarioComSessao(
  perfil: Perfil,
  extras: Partial<Prisma.UserUncheckedCreateInput> = {},
) {
  contador += 1;
  const user = await prisma.user.create({
    data: {
      nome: `Usuário ${contador}`,
      email: `usuario${contador}@teste.com`,
      senhaHash: 'hash-nao-usado-nos-testes',
      perfil,
      status: 'ativo',
      ...extras,
    },
  });
  const token = await criarSessao(user.id);
  return { user, cookie: `${COOKIE_SESSAO}=${token}` };
}

export const criarDemandante = (nome?: string, tipo: TipoDemandante = 'outro') =>
  // Demandante.nome é único: sem nome explícito, gera um diferente a cada chamada
  prisma.demandante.create({ data: { nome: nome ?? `Órgão Teste ${++contador}`, tipo } });

export const criarFiscal = (nome = 'Fiscal Teste', userId?: number) =>
  prisma.fiscal.create({ data: { nome, userId } });

export const criarDemanda = (dados: Prisma.DemandaUncheckedCreateInput) =>
  prisma.demanda.create({ data: dados });

/** "AAAA-MM-DD" -> Date, como o Prisma espera para colunas DATE. */
export const data = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
