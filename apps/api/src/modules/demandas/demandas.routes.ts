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
import { listarHistorico, registrar, type EventoHistorico } from '../historico/historico';
import {
  notificarAbertaEmCampo,
  notificarAtribuida,
  notificarReaberta,
  notificarValidada,
} from '../notificacoes/notificacoes';
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

/** Devolve o fiscal (ou null se não foi informado); 400 se o id não existe. */
async function buscarFiscal(fiscalId: number | null | undefined) {
  if (!fiscalId) return null;
  const fiscal = await prisma.fiscal.findUnique({ where: { id: fiscalId }, select: { id: true, nome: true } });
  if (!fiscal) throw new ErroHttp(400, 'Fiscal não encontrado.');
  return fiscal;
}

const prazoIso = (demanda: { prazo: Date }) => demanda.prazo.toISOString().slice(0, 10);

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
    await buscarFiscal(dados.fiscalId);
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

  const eventos: EventoHistorico[] = [
    { tipo: 'criada', dados: { origem: dadosCriacao.origem ?? 'planejada' } },
    ...arquivos.map((arquivo) => ({ tipo: 'anexo_adicionado' as const, dados: { nome: arquivo.nomeOriginal } })),
  ];

  // Arquivos primeiro; depois demanda, anexos e histórico numa única transação.
  // Se o banco falhar, os arquivos já gravados são removidos.
  await gravarArquivos(arquivos);
  try {
    const criada = await prisma.$transaction(async (tx) => {
      const nova = await tx.demanda.create({
        data: { ...dadosCriacao, anexos: { create: paraCriacao(arquivos, usuario.id) } },
        include: INCLUIR_RELACOES,
      });
      await registrar(tx, nova.id, usuario.id, eventos);
      if (nova.status === 'em_analise') await notificarAbertaEmCampo(tx, nova, usuario);
      else if (nova.fiscalId) await notificarAtribuida(tx, nova, nova.fiscalId, usuario.id);
      return nova;
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
    include: { fiscal: { select: { nome: true } } },
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

  // Reabrir uma demanda concluída: só o gestor, e sempre com o motivo registrado
  const reabrindo = atual.status === 'concluida' && dados.status !== undefined && dados.status !== 'concluida';
  if (reabrindo) {
    if (usuario.perfil !== 'gestor') {
      throw new ErroHttp(403, 'Só o gestor pode reabrir uma demanda concluída.');
    }
    if (!dados.motivo || dados.motivo.length < 3) {
      throw new ErroHttp(400, 'Informe o motivo da reabertura.');
    }
  }

  const novoFiscal = await buscarFiscal(dados.fiscalId);

  // Só vira evento o que de fato mudou
  const eventos: EventoHistorico[] = [];
  if (dados.status !== undefined && dados.status !== atual.status) {
    eventos.push(
      reabrindo
        ? { tipo: 'reaberta', dados: { para: dados.status, motivo: dados.motivo! } }
        : { tipo: 'status_alterado', dados: { de: atual.status, para: dados.status } },
    );
  }
  if (dados.fiscalId !== undefined && (dados.fiscalId ?? null) !== atual.fiscalId) {
    eventos.push({
      tipo: 'fiscal_alterado',
      dados: { de: atual.fiscal?.nome ?? null, para: novoFiscal?.nome ?? null },
    });
  }
  if (dados.prazo !== undefined && dados.prazo !== prazoIso(atual)) {
    eventos.push({ tipo: 'prazo_alterado', dados: { de: prazoIso(atual), para: dados.prazo } });
  }
  if (dados.assunto !== undefined && dados.assunto !== atual.assunto) {
    eventos.push({ tipo: 'assunto_alterado', dados: { de: atual.assunto, para: dados.assunto } });
  }

  const alteracoes: Prisma.DemandaUncheckedUpdateInput = {};
  if (dados.status !== undefined) {
    alteracoes.status = dados.status;
    // Data de conclusão: preserva a original se já estava concluída; limpa se reabriu
    alteracoes.concluidaEm = dados.status === 'concluida' ? (atual.concluidaEm ?? new Date()) : null;
  }
  if (dados.fiscalId !== undefined) alteracoes.fiscalId = dados.fiscalId;
  if (dados.prazo !== undefined) alteracoes.prazo = paraData(dados.prazo);
  if (dados.assunto !== undefined) alteracoes.assunto = dados.assunto;

  const atualizada = await prisma.$transaction(async (tx) => {
    const resultado = await tx.demanda.update({
      where: { id },
      data: alteracoes,
      include: INCLUIR_RELACOES,
    });
    await registrar(tx, id, usuario.id, eventos);
    if (dados.fiscalId && dados.fiscalId !== atual.fiscalId) {
      await notificarAtribuida(tx, resultado, dados.fiscalId, usuario.id);
    }
    if (reabrindo) await notificarReaberta(tx, resultado, dados.motivo!, usuario.id);
    return resultado;
  });
  res.json(serializarDemanda(atualizada, hoje));
});

// O gestor formaliza uma demanda aberta em campo, podendo ajustar fiscal e prazo.
demandasRouter.post('/:id/validar', exigirPerfil('gestor'), async (req, res) => {
  const id = lerId(req.params.id);
  const dados = validar(validarDemandaSchema, req.body);
  const usuario = req.usuario!;
  const hoje = hojeNoFuso(env.TZ_NEGOCIO);

  const existente = await prisma.demanda.findUnique({
    where: { id },
    include: { fiscal: { select: { nome: true } } },
  });
  if (!existente) throw new ErroHttp(404, 'Demanda não encontrada.');

  const novoFiscal = await buscarFiscal(dados.fiscalId);

  const eventos: EventoHistorico[] = [{ tipo: 'validada' }];
  if (dados.fiscalId !== undefined && (dados.fiscalId ?? null) !== existente.fiscalId) {
    eventos.push({
      tipo: 'fiscal_alterado',
      dados: { de: existente.fiscal?.nome ?? null, para: novoFiscal?.nome ?? null },
    });
  }
  if (dados.prazo !== undefined && dados.prazo !== prazoIso(existente)) {
    eventos.push({ tipo: 'prazo_alterado', dados: { de: prazoIso(existente), para: dados.prazo } });
  }

  const alteracoes: Prisma.DemandaUncheckedUpdateManyInput = {
    status: 'aberta',
    validadaPorId: usuario.id,
    validadaEm: new Date(),
  };
  if (dados.fiscalId !== undefined) alteracoes.fiscalId = dados.fiscalId;
  if (dados.prazo !== undefined) alteracoes.prazo = paraData(dados.prazo);

  const validada = await prisma.$transaction(async (tx) => {
    // O filtro por status faz a validação ser atômica: se dois gestores clicarem
    // ao mesmo tempo, só um altera e o outro recebe 409 (e nada é registrado).
    const resultado = await tx.demanda.updateMany({ where: { id, status: 'em_analise' }, data: alteracoes });
    if (resultado.count === 0) throw new ErroHttp(409, 'Esta demanda já foi validada.');
    await registrar(tx, id, usuario.id, eventos);
    const pronta = await tx.demanda.findUniqueOrThrow({ where: { id }, include: INCLUIR_RELACOES });
    await notificarValidada(tx, pronta, usuario.id);
    return pronta;
  });
  res.json(serializarDemanda(validada, hoje));
});

// O histórico é interno: o representante do órgão não vê as movimentações da equipe.
demandasRouter.get('/:id/historico', exigirPerfil('gestor', 'inspetor'), async (req, res) => {
  const id = lerId(req.params.id);
  const demanda = await prisma.demanda.findFirst({
    where: { AND: [{ id }, escopoDemandas(req.usuario!)] },
    select: { id: true },
  });
  if (!demanda) throw new ErroHttp(404, 'Demanda não encontrada.');

  res.json(await listarHistorico(id));
});
