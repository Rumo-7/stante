import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { atualizarUsuarioSchema, listarUsuariosQuerySchema } from '@stante/shared';
import { exigirPerfil } from '../../auth/middleware';
import { prisma } from '../../db';
import { ErroHttp } from '../../http/erros';
import { validar } from '../../http/validar';

// Tudo aqui é administração de contas: só o gestor. Sem `router.use`, para não
// barrar rotas de outros módulos montadas depois (ver o router de referência).
export const usuariosRouter = Router();

const INCLUIR = {
  fiscal: { select: { id: true, nome: true } },
  demandante: { select: { id: true, nome: true } },
} satisfies Prisma.UserInclude;

type UsuarioComVinculos = Prisma.UserGetPayload<{ include: typeof INCLUIR }>;

// Nunca inclui o hash da senha
const serializar = (usuario: UsuarioComVinculos) => ({
  id: usuario.id,
  nome: usuario.nome,
  email: usuario.email,
  perfil: usuario.perfil,
  status: usuario.status,
  criadoEm: usuario.createdAt.toISOString(),
  fiscalId: usuario.fiscal?.id ?? null,
  fiscal: usuario.fiscal?.nome ?? null,
  demandanteId: usuario.demandante?.id ?? null,
  demandante: usuario.demandante?.nome ?? null,
});

function lerId(valor: unknown): number {
  const id = typeof valor === 'string' ? Number(valor) : NaN;
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) {
    throw new ErroHttp(404, 'Usuário não encontrado.');
  }
  return id;
}

usuariosRouter.get('/', exigirPerfil('gestor'), async (req, res) => {
  const { status } = validar(listarUsuariosQuerySchema, req.query);

  const usuarios = await prisma.user.findMany({
    where: status ? { status } : {},
    include: INCLUIR,
    // A ordem do enum é pendente, ativo, bloqueado: quem espera aprovação vem primeiro
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  res.json(usuarios.map(serializar));
});

usuariosRouter.patch('/:id', exigirPerfil('gestor'), async (req, res) => {
  const id = lerId(req.params.id);
  const dados = validar(atualizarUsuarioSchema, req.body);
  const gestor = req.usuario!;

  // Evita o gestor se trancar para fora (bloquear ou rebaixar a si mesmo)
  if (id === gestor.id) throw new ErroHttp(403, 'Você não pode alterar a sua própria conta.');

  const alvo = await prisma.user.findUnique({ where: { id } });
  if (!alvo) throw new ErroHttp(404, 'Usuário não encontrado.');

  const perfilFinal = dados.perfil ?? alvo.perfil;
  if (dados.fiscalId != null && perfilFinal !== 'inspetor') {
    throw new ErroHttp(400, 'Só inspetores podem ser vinculados a um fiscal.');
  }
  if (dados.demandanteId != null && perfilFinal !== 'representante') {
    throw new ErroHttp(400, 'Só representantes podem ser vinculados a um órgão.');
  }

  if (dados.fiscalId) {
    const fiscal = await prisma.fiscal.findUnique({ where: { id: dados.fiscalId } });
    if (!fiscal) throw new ErroHttp(400, 'Fiscal não encontrado.');
    if (fiscal.userId && fiscal.userId !== id) {
      throw new ErroHttp(409, 'Este fiscal já está vinculado a outro usuário.');
    }
  }
  if (dados.demandanteId) {
    const demandante = await prisma.demandante.findUnique({
      where: { id: dados.demandanteId },
      select: { id: true },
    });
    if (!demandante) throw new ErroHttp(400, 'Órgão não encontrado.');
  }

  try {
    await prisma.$transaction(async (tx) => {
      const alteracoes: Prisma.UserUncheckedUpdateInput = {};
      if (dados.status) alteracoes.status = dados.status;
      if (dados.perfil) alteracoes.perfil = dados.perfil;

      // Vínculo com órgão só existe para representante; trocar de perfil limpa o que não vale mais
      if (perfilFinal !== 'representante') alteracoes.demandanteId = null;
      else if (dados.demandanteId !== undefined) alteracoes.demandanteId = dados.demandanteId;

      await tx.user.update({ where: { id }, data: alteracoes });

      // Vínculo com fiscal só existe para inspetor
      if (perfilFinal !== 'inspetor') {
        await tx.fiscal.updateMany({ where: { userId: id }, data: { userId: null } });
      } else if (dados.fiscalId !== undefined) {
        await tx.fiscal.updateMany({ where: { userId: id }, data: { userId: null } });
        if (dados.fiscalId) {
          await tx.fiscal.update({ where: { id: dados.fiscalId }, data: { userId: id } });
        }
      }

      if (dados.status === 'bloqueado') await tx.sessao.deleteMany({ where: { userId: id } });
    });
  } catch (erro) {
    // Dois gestores vinculando o mesmo fiscal ao mesmo tempo: o banco garante a unicidade
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw new ErroHttp(409, 'Este fiscal já está vinculado a outro usuário.');
    }
    throw erro;
  }

  const atualizado = await prisma.user.findUniqueOrThrow({ where: { id }, include: INCLUIR });
  res.json(serializar(atualizado));
});
