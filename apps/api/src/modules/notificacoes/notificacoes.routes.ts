import { Router } from 'express';
import { exigirLogin } from '../../auth/middleware';
import { prisma } from '../../db';
import { ErroHttp } from '../../http/erros';

// Cada pessoa só enxerga e altera os próprios avisos.
// Sem `router.use`, para não barrar rotas de outros módulos montadas depois.
export const notificacoesRouter = Router();

const LIMITE_PADRAO = 20;
const LIMITE_MAXIMO = 50;

notificacoesRouter.get('/', exigirLogin, async (req, res) => {
  const userId = req.usuario!.id;
  const pedido = Number(req.query.limite);
  const limite = Number.isInteger(pedido) && pedido > 0 ? Math.min(pedido, LIMITE_MAXIMO) : LIMITE_PADRAO;

  const [itens, naoLidas] = await Promise.all([
    prisma.notificacao.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limite,
    }),
    prisma.notificacao.count({ where: { userId, lidaEm: null } }),
  ]);

  res.json({
    naoLidas,
    itens: itens.map((item) => ({
      id: item.id,
      tipo: item.tipo,
      mensagem: item.mensagem,
      demandaId: item.demandaId,
      lida: item.lidaEm !== null,
      criadaEm: item.createdAt.toISOString(),
    })),
  });
});

notificacoesRouter.post('/lidas', exigirLogin, async (req, res) => {
  const resultado = await prisma.notificacao.updateMany({
    where: { userId: req.usuario!.id, lidaEm: null },
    data: { lidaEm: new Date() },
  });
  res.json({ marcadas: resultado.count });
});

notificacoesRouter.post('/:id/lida', exigirLogin, async (req, res) => {
  const id = typeof req.params.id === 'string' ? Number(req.params.id) : NaN;
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) {
    throw new ErroHttp(404, 'Aviso não encontrado.');
  }

  // Filtra pelo dono: o aviso de outra pessoa responde como se não existisse
  const resultado = await prisma.notificacao.updateMany({
    where: { id, userId: req.usuario!.id, lidaEm: null },
    data: { lidaEm: new Date() },
  });
  if (resultado.count === 0) {
    const existe = await prisma.notificacao.findFirst({ where: { id, userId: req.usuario!.id }, select: { id: true } });
    if (!existe) throw new ErroHttp(404, 'Aviso não encontrado.');
  }
  res.json({ ok: true });
});
