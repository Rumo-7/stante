import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { periodoDoParecerSchema } from '@stante/shared';
import { exigirPerfil } from '../../auth/middleware';
import { prisma } from '../../db';
import { env } from '../../env';
import { ErroHttp } from '../../http/erros';
import { validar } from '../../http/validar';
import { numerosForaDosDados } from './conferencia';
import { montarFatos, type FatosParecer } from './fatos';
import type { GeradorDeTexto } from './gerador';
import { avisoDeMinuta, montarMensagens } from './prompt';

const LIMITE_DA_LISTA = 30;

const serializar = (registro: {
  id: number;
  periodoDe: Date;
  periodoAte: Date;
  fatos: unknown;
  texto: string;
  modelo: string;
  conferencia: unknown;
  createdAt: Date;
  geradoPor: { nome: string } | null;
}) => ({
  id: registro.id,
  periodo: {
    de: registro.periodoDe.toISOString().slice(0, 10),
    ate: registro.periodoAte.toISOString().slice(0, 10),
  },
  texto: registro.texto,
  fatos: registro.fatos as FatosParecer,
  modelo: registro.modelo,
  // Números do texto que não estavam nos dados enviados à IA: o gestor deve conferir
  numerosParaConferir: registro.conferencia as string[],
  geradoPor: registro.geradoPor?.nome ?? null,
  criadoEm: registro.createdAt.toISOString(),
});

// Cada parecer é uma chamada ao serviço de IA (plano gratuito, com limite) e o texto é longo:
// o limite é por pessoa, e não por endereço de rede.
const limitarGeracoes = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  keyGenerator: (req) => `usuario-${req.usuario?.id ?? 'anonimo'}`,
  message: { erro: 'Muitos pareceres em pouco tempo. Aguarde alguns minutos.' },
});

/** Recebe o gerador pronto: nos testes entra um falso, sem rede e sem chave. */
export function criarRelatoriosRouter(gerador: GeradorDeTexto | null): Router {
  // Sem `router.use`, para não barrar rotas de outros módulos montadas depois (ver o router de referência)
  const router = Router();

  router.get('/configuracao', exigirPerfil('gestor'), (_req, res) => {
    res.json({ iaDisponivel: gerador !== null, modelo: gerador?.modelo ?? null });
  });

  // Os números que a IA receberia. Não gasta IA: serve para o gestor conferir a base antes de gerar.
  router.get('/fatos', exigirPerfil('gestor'), async (req, res) => {
    const periodo = validar(periodoDoParecerSchema, req.query);
    res.json(await montarFatos(periodo));
  });

  router.post('/parecer', exigirPerfil('gestor'), limitarGeracoes, async (req, res) => {
    const periodo = validar(periodoDoParecerSchema, req.body);
    if (!gerador) {
      throw new ErroHttp(503, 'A geração de pareceres por IA não está configurada neste ambiente.');
    }

    const fatos = await montarFatos(periodo);
    if (fatos.demandas.recebidas === 0) {
      throw new ErroHttp(422, 'Não há demandas recebidas neste período para embasar um parecer.');
    }

    const resposta = await gerador.gerar(montarMensagens(fatos));
    const numerosParaConferir = numerosForaDosDados(resposta.texto, fatos);
    // O aviso é acrescentado por nós, e não pedido à IA: não depende de ela obedecer
    const corte = resposta.truncada
      ? '\n\n> **Atenção: a IA interrompeu a resposta por limite de tamanho. O texto acima está incompleto.** Gere de novo, com um período menor.'
      : '';
    const texto = `${resposta.texto}${corte}\n\n---\n*${avisoDeMinuta(resposta.modelo)}*`;

    const registro = await prisma.relatorio.create({
      data: {
        periodoDe: new Date(`${periodo.de}T00:00:00.000Z`),
        periodoAte: new Date(`${periodo.ate}T00:00:00.000Z`),
        fatos: fatos as unknown as Prisma.InputJsonValue,
        texto,
        modelo: resposta.modelo,
        tokensEntrada: resposta.tokensEntrada,
        tokensSaida: resposta.tokensSaida,
        conferencia: numerosParaConferir,
        geradoPorId: req.usuario!.id,
      },
      include: { geradoPor: { select: { nome: true } } },
    });

    res.status(201).json(serializar(registro));
  });

  router.get('/', exigirPerfil('gestor'), async (_req, res) => {
    const registros = await prisma.relatorio.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: LIMITE_DA_LISTA,
      include: { geradoPor: { select: { nome: true } } },
    });
    // A lista não carrega o texto inteiro nem os fatos: isso vem ao abrir um parecer
    res.json(
      registros.map((registro) => {
        const { texto: _texto, fatos: _fatos, ...resumo } = serializar(registro);
        return resumo;
      }),
    );
  });

  router.get('/:id', exigirPerfil('gestor'), async (req, res) => {
    const id = typeof req.params.id === 'string' ? Number(req.params.id) : NaN;
    if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) {
      throw new ErroHttp(404, 'Parecer não encontrado.');
    }
    const registro = await prisma.relatorio.findUnique({
      where: { id },
      include: { geradoPor: { select: { nome: true } } },
    });
    if (!registro) throw new ErroHttp(404, 'Parecer não encontrado.');
    res.json(serializar(registro));
  });

  return router;
}
