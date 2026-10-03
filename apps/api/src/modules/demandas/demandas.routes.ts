import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  atualizarDemandaSchema,
  criarDemandaSchema,
  hojeNoFuso,
  listarDemandasQuerySchema,
  validarDemandaSchema,
} from '@stante/shared';
import { exigirLogin, exigirPerfil } from '../../auth/middleware';
import { prisma } from '../../db';
import { env } from '../../env';
import { ErroHttp } from '../../http/erros';
import { validar } from '../../http/validar';
import {
  descartarArquivos,
  gravarArquivos,
  paraCriacao,
  validarArquivos,
} from '../anexos/arquivos';
import { arquivosDaRequisicao, receberAnexos } from '../anexos/upload';
import { escopoDemandas } from './escopo';
import { montarWhere, paraData } from './filtros';
import { INCLUIR_RELACOES, serializarDemanda } from './serializar';

export const demandasRouter = Router();

demandasRouter.use(exigirLogin);

function lerId(valor: unknown): number {
  const id = typeof valor === 'string' ? Number(valor) : NaN;
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) {
    throw new ErroHttp(404, 'Demanda não encontrada.');
  }
  return id;
}

async function garantirFiscalExiste(fiscalId: number | null | undefined) {
  if (!fiscalId) return;
  const fiscal = await prisma.fiscal.findUnique({ where: { id: fiscalId }, select: { id: true } });
  if (!fiscal) throw new ErroHttp(400, 'Fiscal não encontrado.');
}

demandasRouter.get('/', async (req, res) => {
  const consulta = validar(listarDemandasQuerySchema, req.query);
  const hoje = hojeNoFuso(env.TZ_NEGOCIO);

  const demandas = await prisma.demanda.findMany({
    where: montarWhere(consulta, req.usuario!, hoje),
    include: INCLUIR_RELACOES,
    orderBy:
      consulta.ordenar === 'recentes' ? [{ id: 'desc' }] : [{ prazo: 'asc' }, { id: 'asc' }],
    take: consulta.limite,
  });

  res.json(demandas.map((demanda) => serializarDemanda(demanda, hoje)));
});

demandasRouter.post('/', exigirPerfil('gestor', 'inspetor'), receberAnexos, async (req, res) => {
  const dados = validar(criarDemandaSchema, req.body);
  const usuario = req.usuario!;
  const hoje = hojeNoFuso(env.TZ_NEGOCIO);
  // O formulário pode enviar arquivos junto (multipart); tudo é validado antes de gravar qualquer coisa
  const arquivos = validarArquivos(arquivosDaRequisicao(req));

  const demandante = await prisma.demandante.findUnique({
    where: { id: dados.demandanteId },
    select: { id: true },
  });
  if (!demandante) throw new ErroHttp(400, 'Demandante não encontrado.');

  let dadosCriacao: Prisma.DemandaUncheckedCreateInput;

  if (usuario.perfil === 'inspetor') {
    if (!usuario.fiscalId) {
      throw new ErroHttp(403, 'Seu usuário ainda não está vinculado a um fiscal. Peça a um gestor.');
    }
    // Registro de campo: o inspetor é o fiscal da demanda (qualquer fiscalId
    // enviado é ignorado) e ela fica em análise até um gestor validar.
    dadosCriacao = {
      demandanteId: dados.demandanteId,
      assunto: dados.assunto,
      prazo: paraData(dados.prazo),
      fiscalId: usuario.fiscalId,
      status: 'em_analise',
      origem: 'campo',
      criadaPorId: usuario.id,
    };
  } else {
    await garantirFiscalExiste(dados.fiscalId);
    dadosCriacao = {
      demandanteId: dados.demandanteId,
      assunto: dados.assunto,
      prazo: paraData(dados.prazo),
      fiscalId: dados.fiscalId ?? null,
      status: 'aberta',
      origem: 'planejada',
      criadaPorId: usuario.id,
    };
  }

  // Arquivos primeiro, depois a demanda com os anexos numa única operação do banco.
  // Se o banco falhar, os arquivos já gravados são removidos.
  await gravarArquivos(arquivos);
  try {
    const criada = await prisma.demanda.create({
      data: { ...dadosCriacao, anexos: { create: paraCriacao(arquivos, usuario.id) } },
      include: INCLUIR_RELACOES,
    });
    res.status(201).json(serializarDemanda(criada, hoje));
  } catch (erro) {
    await descartarArquivos(arquivos);
    throw erro;
  }
});

demandasRouter.patch('/:id', exigirPerfil('gestor', 'inspetor'), async (req, res) => {
  const id = lerId(req.params.id);
  const dados = validar(atualizarDemandaSchema, req.body);
  const usuario = req.usuario!;
  const hoje = hojeNoFuso(env.TZ_NEGOCIO);

  const atual = await prisma.demanda.findFirst({
    where: { AND: [{ id }, escopoDemandas(usuario)] },
  });
  if (!atual) throw new ErroHttp(404, 'Demanda não encontrada.');

  if (usuario.perfil === 'inspetor') {
    if (dados.fiscalId !== undefined || dados.prazo !== undefined || dados.assunto !== undefined) {
      throw new ErroHttp(403, 'Inspetores só podem alterar o status das suas demandas.');
    }
  }

  if (atual.status === 'em_analise') {
    throw usuario.perfil === 'gestor'
      ? new ErroHttp(409, 'Valide a demanda antes de alterá-la.')
      : new ErroHttp(403, 'Esta demanda aguarda a validação de um gestor.');
  }

  await garantirFiscalExiste(dados.fiscalId);

  const alteracoes: Prisma.DemandaUncheckedUpdateInput = {};
  if (dados.status !== undefined) {
    alteracoes.status = dados.status;
    // Data de conclusão: preserva a original se já estava concluída; limpa se reabriu
    alteracoes.concluidaEm = dados.status === 'concluida' ? (atual.concluidaEm ?? new Date()) : null;
  }
  if (dados.fiscalId !== undefined) alteracoes.fiscalId = dados.fiscalId;
  if (dados.prazo !== undefined) alteracoes.prazo = paraData(dados.prazo);
  if (dados.assunto !== undefined) alteracoes.assunto = dados.assunto;

  const atualizada = await prisma.demanda.update({
    where: { id },
    data: alteracoes,
    include: INCLUIR_RELACOES,
  });
  res.json(serializarDemanda(atualizada, hoje));
});

// O gestor formaliza uma demanda aberta em campo, podendo ajustar fiscal e prazo.
demandasRouter.post('/:id/validar', exigirPerfil('gestor'), async (req, res) => {
  const id = lerId(req.params.id);
  const dados = validar(validarDemandaSchema, req.body);
  const usuario = req.usuario!;
  const hoje = hojeNoFuso(env.TZ_NEGOCIO);

  const existente = await prisma.demanda.findUnique({ where: { id }, select: { id: true } });
  if (!existente) throw new ErroHttp(404, 'Demanda não encontrada.');

  await garantirFiscalExiste(dados.fiscalId);

  const alteracoes: Prisma.DemandaUncheckedUpdateManyInput = {
    status: 'aberta',
    validadaPorId: usuario.id,
    validadaEm: new Date(),
  };
  if (dados.fiscalId !== undefined) alteracoes.fiscalId = dados.fiscalId;
  if (dados.prazo !== undefined) alteracoes.prazo = paraData(dados.prazo);

  // O filtro por status faz a validação ser atômica: se dois gestores clicarem
  // ao mesmo tempo, só um altera e o outro recebe 409.
  const resultado = await prisma.demanda.updateMany({
    where: { id, status: 'em_analise' },
    data: alteracoes,
  });
  if (resultado.count === 0) throw new ErroHttp(409, 'Esta demanda já foi validada.');

  const validada = await prisma.demanda.findUniqueOrThrow({ where: { id }, include: INCLUIR_RELACOES });
  res.json(serializarDemanda(validada, hoje));
});
