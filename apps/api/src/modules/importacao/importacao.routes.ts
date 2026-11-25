import { Prisma } from '@prisma/client';
import { hojeNoFuso } from '@stante/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { exigirLogin, exigirPerfil } from '../../auth/middleware';
import { prisma } from '../../db';
import { env } from '../../env';
import { ErroHttp } from '../../http/erros';
import { paraData } from '../demandas/filtros';
import { registrar } from '../historico/historico';
import { notificarAtribuida } from '../notificacoes/notificacoes';
import { analisarPlanilha, processosDaPlanilha, ROTULO_CAMPO, type Analise } from './analisar';
import { decodificar, lerCsv } from './csv';

const TAMANHO_MAXIMO_CSV = 2 * 1024 * 1024;

// Só o gestor importa: demandas de inspetor nascem "em análise", o que não faz sentido aqui
export const importacaoRouter = Router();
importacaoRouter.use(exigirLogin, exigirPerfil('gestor'));

const multerCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_CSV, files: 1 },
});

function receberCsv(req: Request, res: Response, next: NextFunction) {
  multerCsv.single('arquivo')(req, res, (erro: unknown) => {
    if (!erro) return next();
    if (erro instanceof multer.MulterError) {
      if (erro.code === 'LIMIT_FILE_SIZE') return next(new ErroHttp(413, 'O CSV pode ter no máximo 2 MB.'));
      return next(new ErroHttp(400, 'Envie um único arquivo CSV no campo "arquivo".'));
    }
    next(erro);
  });
}

/** Lê o arquivo enviado e analisa cada linha com os órgãos, fiscais e processos atuais do banco. */
async function analisarRequisicao(req: Request): Promise<Analise> {
  const arquivo = req.file;
  if (!arquivo) throw new ErroHttp(400, 'Selecione o arquivo CSV.');
  // O tipo informado pelo navegador varia (o Excel manda até "application/vnd.ms-excel"); o nome é mais confiável
  if (!/\.(csv|txt)$/i.test(arquivo.originalname)) {
    throw new ErroHttp(400, 'O arquivo precisa ser .csv. No Excel: Arquivo > Salvar como > CSV.');
  }

  const linhas = lerCsv(decodificar(arquivo.buffer));
  const processos = processosDaPlanilha(linhas);

  const [demandantes, fiscais, existentes] = await Promise.all([
    prisma.demandante.findMany({ select: { id: true, nome: true } }),
    prisma.fiscal.findMany({ select: { id: true, nome: true } }),
    processos.length > 0
      ? prisma.demanda.findMany({ where: { processoSei: { in: processos } }, select: { processoSei: true } })
      : Promise.resolve([]),
  ]);

  return analisarPlanilha(linhas, {
    hoje: hojeNoFuso(env.TZ_NEGOCIO),
    demandantes,
    fiscais,
    processosExistentes: new Set(existentes.map((d) => d.processoSei!)),
  });
}

/** O que a tela recebe: sem os dados internos de gravação, com os nomes das colunas legíveis. */
function paraResposta(analise: Analise) {
  const validas = analise.linhas.filter((linha) => linha.dados).length;
  return {
    colunas: {
      reconhecidas: analise.cabecalho.reconhecidas.map(({ coluna, campo }) => ({ coluna, campo: ROTULO_CAMPO[campo] })),
      ignoradas: analise.cabecalho.ignoradas,
    },
    linhas: analise.linhas.map(({ linha, erros, resumo }) => ({ linha, erros, ...resumo })),
    totais: { validas, comErro: analise.linhas.length - validas },
  };
}

/** Prévia: analisa o arquivo e diz o que seria importado, sem gravar nada. */
importacaoRouter.post('/previa', receberCsv, async (req, res) => {
  res.json(paraResposta(await analisarRequisicao(req)));
});

/**
 * Importa as linhas válidas. O arquivo é analisado de novo (não confiamos na prévia que a tela
 * guardou: algo pode ter mudado no meio do caminho). Linhas com erro ficam de fora.
 */
importacaoRouter.post('/', receberCsv, async (req, res) => {
  const analise = await analisarRequisicao(req);
  const validas = analise.linhas.flatMap((linha) => (linha.dados ? [linha.dados] : []));
  if (validas.length === 0) throw new ErroHttp(400, 'Nenhuma linha válida para importar. Corrija os erros da prévia.');

  const usuario = req.usuario!;
  try {
    // Tudo ou nada entre as válidas: se o banco falhar no meio, nenhuma fica pela metade.
    // O tempo limite é maior que o padrão (5 s) porque uma planilha pode ter centenas de linhas.
    await prisma.$transaction(
      async (tx) => {
        for (const dados of validas) {
          const nova = await tx.demanda.create({
            data: {
              demandanteId: dados.demandanteId,
              fiscalId: dados.fiscalId,
              assunto: dados.assunto,
              prazo: paraData(dados.prazo),
              recebidaEm: dados.recebidaEm ? paraData(dados.recebidaEm) : null,
              processoSei: dados.processoSei,
              status: dados.status,
              origem: 'planejada',
              criadaPorId: usuario.id,
            },
          });
          await registrar(tx, nova.id, usuario.id, [
            {
              tipo: 'criada',
              dados: { origem: 'planejada', importada: true, ...(dados.processoSei ? { processoSei: dados.processoSei } : {}) },
            },
          ]);
          if (nova.fiscalId) await notificarAtribuida(tx, nova, nova.fiscalId, usuario.id);
        }
      },
      { timeout: 60_000 },
    );
  } catch (erro) {
    // Outra importação gravou o mesmo processo entre a análise e a gravação
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw new ErroHttp(409, 'Algum processo SEI desta planilha acabou de ser importado. Gere a prévia de novo.');
    }
    throw erro;
  }

  res.status(201).json({ ...paraResposta(analise), criadas: validas.length });
});
