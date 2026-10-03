import { Router } from 'express';
import { Prisma } from '@prisma/client';
import {
  criarDemandanteSchema,
  criarFiscalSchema,
  ROTULO_TIPO_DEMANDANTE,
} from '@stante/shared';
import { exigirPerfil } from '../../auth/middleware';
import { prisma } from '../../db';
import { ErroHttp } from '../../http/erros';
import { validar } from '../../http/validar';

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
      demandas_ativas: fiscal._count.demandas,
    })),
  );
});

referenciaRouter.post('/fiscais', exigirPerfil('gestor'), async (req, res) => {
  const dados = validar(criarFiscalSchema, req.body);
  const criado = await prisma.fiscal.create({ data: dados });
  res.status(201).json({
    id: criado.id,
    nome: criado.nome,
    especialidade: criado.especialidade,
    demandas_ativas: 0,
  });
});

// Demandantes: o inspetor precisa da lista para abrir demandas em campo
referenciaRouter.get('/demandantes', exigirPerfil('gestor', 'inspetor'), async (_req, res) => {
  const demandantes = await prisma.demandante.findMany({ orderBy: { id: 'asc' } });
  res.json(
    demandantes.map((d) => ({
      id: d.id,
      nome: d.nome,
      tipo: d.tipo,
      tipoRotulo: ROTULO_TIPO_DEMANDANTE[d.tipo],
    })),
  );
});

referenciaRouter.post('/demandantes', exigirPerfil('gestor', 'inspetor'), async (req, res) => {
  const dados = validar(criarDemandanteSchema, req.body);

  try {
    const criado = await prisma.demandante.create({ data: { nome: dados.nome, tipo: 'outro' } });
    res.status(201).json({
      id: criado.id,
      nome: criado.nome,
      tipo: criado.tipo,
      tipoRotulo: ROTULO_TIPO_DEMANDANTE[criado.tipo],
    });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw new ErroHttp(409, 'Este órgão já está cadastrado.');
    }
    throw erro;
  }
});
