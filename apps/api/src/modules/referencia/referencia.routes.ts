import { Router } from 'express';
import { Prisma, type TipoDemandante } from '@prisma/client';
import { z } from 'zod';
import {
  atualizarDemandanteSchema,
  criarDemandanteSchema,
  criarFiscalSchema,
  periodoQuerySchema,
  ROTULO_TIPO_DEMANDANTE,
} from '@stante/shared';
import { exigirPerfil } from '../../auth/middleware';
import { prisma } from '../../db';
import { ErroHttp } from '../../http/erros';
import { validar } from '../../http/validar';
import { estatisticasPorOrgao } from '../demandantes/estatisticas';
import { sugerirFiscais } from '../fiscais/sugestao';

const consultaSugestaoSchema = z.object({
  demandanteId: z.preprocess(
    (valor) => (valor === '' ? undefined : valor),
    z.coerce.number({ invalid_type_error: 'Órgão inválido.' }).int('Órgão inválido.').positive('Órgão inválido.').optional(),
  ),
});

export const referenciaRouter = Router();

// Sem `router.use(exigirLogin)` de propósito: este router é montado em /api e
// um `use` aqui barraria também as rotas montadas depois dele. Cada rota já
// usa exigirPerfil, que responde 401 quando não há login.

// Fiscais: carga de trabalho de toda a equipe é informação de gestão
referenciaRouter.get('/fiscais', exigirPerfil('gestor'), async (_req, res) => {
  const fiscais = await prisma.fiscal.findMany({
    orderBy: { nome: 'asc' },
    include: {
      _count: { select: { demandas: { where: { status: { not: 'concluida' } } } } },
    },
  });

  res.json(
    fiscais.map((fiscal) => ({
      id: fiscal.id,
      nome: fiscal.nome,
      especialidade: fiscal.especialidade,
      // Usuário que tem este fiscal como "ele mesmo" (inspetor com acesso ao sistema)
      usuarioId: fiscal.userId,
      demandas_ativas: fiscal._count.demandas,
    })),
  );
});

// Ranking de quem está mais indicado para uma demanda (do órgão informado, se houver): a decisão é do gestor
referenciaRouter.get('/fiscais/sugestoes', exigirPerfil('gestor'), async (req, res) => {
  const { demandanteId } = validar(consultaSugestaoSchema, req.query);
  res.json(await sugerirFiscais(demandanteId));
});

referenciaRouter.post('/fiscais', exigirPerfil('gestor'), async (req, res) => {
  const dados = validar(criarFiscalSchema, req.body);
  const criado = await prisma.fiscal.create({ data: dados });
  res.status(201).json({
    id: criado.id,
    nome: criado.nome,
    especialidade: criado.especialidade,
    usuarioId: null,
    demandas_ativas: 0,
  });
});

const serializarOrgao = (orgao: { id: number; nome: string; tipo: TipoDemandante }) => ({
  id: orgao.id,
  nome: orgao.nome,
  tipo: orgao.tipo,
  tipoRotulo: ROTULO_TIPO_DEMANDANTE[orgao.tipo],
});

const NOME_JA_CADASTRADO = 'Este órgão já está cadastrado.';

function nomeJaExiste(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}

// Demandantes: o inspetor precisa da lista para abrir demandas em campo
referenciaRouter.get('/demandantes', exigirPerfil('gestor', 'inspetor'), async (_req, res) => {
  const demandantes = await prisma.demandante.findMany({ orderBy: { id: 'asc' } });
  res.json(demandantes.map(serializarOrgao));
});

// Indicadores por órgão (volume, conclusão, pontualidade, tempo): visão de gestão
referenciaRouter.get('/demandantes/estatisticas', exigirPerfil('gestor'), async (req, res) => {
  const periodo = validar(periodoQuerySchema, req.query);
  const { orgaos, resumo } = await estatisticasPorOrgao(periodo);

  res.json({
    periodo: { de: periodo.de ?? null, ate: periodo.ate ?? null },
    resumo,
    orgaos: orgaos.map((orgao) => ({ ...orgao, tipoRotulo: ROTULO_TIPO_DEMANDANTE[orgao.tipo] })),
  });
});

referenciaRouter.post('/demandantes', exigirPerfil('gestor', 'inspetor'), async (req, res) => {
  const dados = validar(criarDemandanteSchema, req.body);
  // Só o gestor classifica o órgão; o inspetor, em campo, cadastra como "outro" e o gestor ajusta depois
  const tipo = req.usuario!.perfil === 'gestor' ? (dados.tipo ?? 'outro') : 'outro';

  try {
    const criado = await prisma.demandante.create({ data: { nome: dados.nome, tipo } });
    res.status(201).json(serializarOrgao(criado));
  } catch (erro) {
    if (nomeJaExiste(erro)) throw new ErroHttp(409, NOME_JA_CADASTRADO);
    throw erro;
  }
});

referenciaRouter.patch('/demandantes/:id', exigirPerfil('gestor'), async (req, res) => {
  const id = typeof req.params.id === 'string' ? Number(req.params.id) : NaN;
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) {
    throw new ErroHttp(404, 'Órgão não encontrado.');
  }
  const dados = validar(atualizarDemandanteSchema, req.body);

  try {
    const atualizado = await prisma.demandante.update({ where: { id }, data: dados });
    res.json(serializarOrgao(atualizado));
  } catch (erro) {
    if (nomeJaExiste(erro)) throw new ErroHttp(409, NOME_JA_CADASTRADO);
    // P2025: o registro a atualizar não existe
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2025') {
      throw new ErroHttp(404, 'Órgão não encontrado.');
    }
    throw erro;
  }
});
