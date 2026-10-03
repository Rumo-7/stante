import { Router, type CookieOptions } from 'express';
import { Prisma } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { cadastroSchema, loginSchema } from '@stante/shared';
import { prisma } from '../../db';
import { env } from '../../env';
import { ErroHttp } from '../../http/erros';
import { validar } from '../../http/validar';
import { exigirLogin } from '../../auth/middleware';
import { confereSenha, HASH_FALSO, hashSenha } from '../../auth/senha';
import {
  COOKIE_SESSAO,
  criarSessao,
  DURACAO_SESSAO_MS,
  encerrarSessao,
} from '../../auth/sessao';

export const authRouter = Router();

const opcoesCookie: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
};

const limitarTentativas = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: { erro: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

authRouter.post('/cadastro', limitarTentativas, async (req, res) => {
  const dados = validar(cadastroSchema, req.body);

  const existente = await prisma.user.findUnique({
    where: { email: dados.email },
    select: { id: true },
  });
  if (existente) throw new ErroHttp(409, 'Este email já está cadastrado.');

  const senhaHash = await hashSenha(dados.senha);

  try {
    // Toda conta nasce pendente: o perfil escolhido aqui é só um pedido, e um
    // gestor precisa aprovar antes de o acesso valer.
    await prisma.user.create({
      data: {
        nome: dados.nome,
        email: dados.email,
        senhaHash,
        perfil: dados.perfil,
        status: 'pendente',
      },
    });
  } catch (erro) {
    // Duas requisições simultâneas com o mesmo e-mail: o banco garante a unicidade
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw new ErroHttp(409, 'Este email já está cadastrado.');
    }
    throw erro;
  }

  res.status(201).json({
    mensagem: 'Cadastro recebido. Aguarde a aprovação de um gestor para acessar.',
  });
});

authRouter.post('/login', limitarTentativas, async (req, res) => {
  const { email, senha } = validar(loginSchema, req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  const senhaConfere = await confereSenha(senha, user?.senhaHash ?? HASH_FALSO);
  if (!user || !senhaConfere) throw new ErroHttp(401, 'Email ou senha inválidos.');

  // O status só é revelado depois que a senha foi confirmada
  if (user.status === 'pendente') {
    throw new ErroHttp(403, 'Seu cadastro ainda aguarda aprovação de um gestor.');
  }
  if (user.status === 'bloqueado') {
    throw new ErroHttp(403, 'Acesso bloqueado. Procure um gestor.');
  }

  const token = await criarSessao(user.id);
  res.cookie(COOKIE_SESSAO, token, { ...opcoesCookie, maxAge: DURACAO_SESSAO_MS });
  res.json({ nome: user.nome, email: user.email, perfil: user.perfil });
});

authRouter.post('/logout', async (req, res) => {
  const token: unknown = req.cookies?.[COOKIE_SESSAO];
  if (typeof token === 'string' && token) await encerrarSessao(token);
  res.clearCookie(COOKIE_SESSAO, opcoesCookie);
  res.status(204).end();
});

authRouter.get('/me', exigirLogin, (req, res) => {
  const { id, nome, email, perfil } = req.usuario!;
  res.json({ id, nome, email, perfil });
});
