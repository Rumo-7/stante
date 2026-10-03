import { Router } from 'express';
import { exigirLogin, exigirPerfil } from '../../auth/middleware';
import { prisma } from '../../db';
import { ErroHttp } from '../../http/erros';
import { armazenamento } from '../../storage';
import { escopoDemandas } from '../demandas/escopo';
import { descartarArquivos, gravarArquivos, paraCriacao, validarArquivos } from './arquivos';
import { arquivosDaRequisicao, receberAnexos } from './upload';

// Sem `router.use(exigirLogin)`: montado em /api, barraria rotas de outros módulos.
export const anexosRouter = Router();

type AnexoBanco = {
  id: number;
  nomeOriginal: string;
  tamanho: number | null;
  enviadoPorId: number | null;
  createdAt: Date;
};

const serializar = (anexo: AnexoBanco) => ({
  id: anexo.id,
  nomeOriginal: anexo.nomeOriginal,
  tamanho: anexo.tamanho,
  enviadoPorId: anexo.enviadoPorId,
  criadoEm: anexo.createdAt.toISOString(),
});

function lerId(valor: unknown, mensagem: string): number {
  const id = typeof valor === 'string' ? Number(valor) : NaN;
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) throw new ErroHttp(404, mensagem);
  return id;
}

anexosRouter.get('/demandas/:demandaId/anexos', exigirLogin, async (req, res) => {
  const demandaId = lerId(req.params.demandaId, 'Demanda não encontrada.');

  const demanda = await prisma.demanda.findFirst({
    where: { AND: [{ id: demandaId }, escopoDemandas(req.usuario!)] },
    select: { id: true },
  });
  if (!demanda) throw new ErroHttp(404, 'Demanda não encontrada.');

  const anexos = await prisma.anexo.findMany({ where: { demandaId }, orderBy: { id: 'asc' } });
  res.json(anexos.map(serializar));
});

anexosRouter.post(
  '/demandas/:demandaId/anexos',
  exigirPerfil('gestor', 'inspetor'),
  receberAnexos,
  async (req, res) => {
    const demandaId = lerId(req.params.demandaId, 'Demanda não encontrada.');
    const usuario = req.usuario!;

    // O inspetor pode anexar provas também à demanda que ainda está em análise
    const demanda = await prisma.demanda.findFirst({
      where: { AND: [{ id: demandaId }, escopoDemandas(usuario)] },
      select: { id: true },
    });
    if (!demanda) throw new ErroHttp(404, 'Demanda não encontrada.');

    const recebidos = arquivosDaRequisicao(req);
    if (!recebidos.length) throw new ErroHttp(400, 'Selecione ao menos um arquivo.');
    const arquivos = validarArquivos(recebidos);

    await gravarArquivos(arquivos);
    try {
      await prisma.anexo.createMany({
        data: paraCriacao(arquivos, usuario.id).map((a) => ({ ...a, demandaId })),
      });
    } catch (erro) {
      await descartarArquivos(arquivos);
      throw erro;
    }

    const anexos = await prisma.anexo.findMany({ where: { demandaId }, orderBy: { id: 'asc' } });
    res.status(201).json(anexos.map(serializar));
  },
);

async function anexoVisivel(id: number, usuario: NonNullable<Express.Request['usuario']>) {
  return prisma.anexo.findFirst({
    where: { id, demanda: escopoDemandas(usuario) },
  });
}

anexosRouter.get('/anexos/:id/download', exigirLogin, async (req, res) => {
  const id = lerId(req.params.id, 'Anexo não encontrado.');
  const anexo = await anexoVisivel(id, req.usuario!);
  if (!anexo) throw new ErroHttp(404, 'Anexo não encontrado.');

  if (!(await armazenamento.existe(anexo.chaveArquivo))) {
    throw new ErroHttp(404, 'Arquivo não encontrado no servidor.');
  }

  res.attachment(anexo.nomeOriginal);
  // Tipo vem do que detectamos ao receber o arquivo; nosniff impede o navegador de reinterpretar
  res.setHeader('Content-Type', anexo.mimeType ?? 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const leitura = armazenamento.abrir(anexo.chaveArquivo);
  leitura.on('error', (erro) => {
    console.error(erro);
    if (!res.headersSent) res.status(500).json({ erro: 'Erro ao ler o arquivo.' });
    else res.destroy(erro);
  });
  leitura.pipe(res);
});

anexosRouter.delete('/anexos/:id', exigirPerfil('gestor', 'inspetor'), async (req, res) => {
  const id = lerId(req.params.id, 'Anexo não encontrado.');
  const usuario = req.usuario!;

  const anexo = await anexoVisivel(id, usuario);
  if (!anexo) throw new ErroHttp(404, 'Anexo não encontrado.');

  // O inspetor só remove o que ele mesmo enviou; o gestor remove qualquer um
  if (usuario.perfil === 'inspetor' && anexo.enviadoPorId !== usuario.id) {
    throw new ErroHttp(403, 'Você só pode remover anexos enviados por você.');
  }

  await prisma.anexo.delete({ where: { id } });
  await armazenamento.remover(anexo.chaveArquivo).catch((erro) => console.error(erro));
  res.json({ mensagem: 'Anexo removido.' });
});
