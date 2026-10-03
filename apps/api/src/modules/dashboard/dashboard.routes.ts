import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  adicionarDias,
  chaveMesNoFuso,
  diasParaPrazo,
  hojeNoFuso,
  numeroDemanda,
  ROTULO_TIPO_DEMANDANTE,
  ultimosMeses,
} from '@stante/shared';
import { exigirLogin } from '../../auth/middleware';
import { prisma } from '../../db';
import { env } from '../../env';
import { escopoDemandas } from '../demandas/escopo';
import { filtroStatus, paraData } from '../demandas/filtros';
import { INCLUIR_RELACOES } from '../demandas/serializar';

export const dashboardRouter = Router();

const MESES_NA_TENDENCIA = 8;
const DIAS_PROXIMOS = 30;

// Demandas formais e em andamento. Em análise ainda não é trabalho formalizado.
const ATIVAS: Prisma.DemandaWhereInput = { status: { in: ['aberta', 'em_andamento'] } };

dashboardRouter.get('/', exigirLogin, async (req, res) => {
  const usuario = req.usuario!;
  const hoje = hojeNoFuso(env.TZ_NEGOCIO);
  const escopo = escopoDemandas(usuario);

  const onde = (...condicoes: Prisma.DemandaWhereInput[]): Prisma.DemandaWhereInput => ({
    AND: [escopo, ...condicoes],
  });
  const contar = (...condicoes: Prisma.DemandaWhereInput[]) =>
    prisma.demanda.count({ where: onde(...condicoes) });

  const meses = ultimosMeses(hoje, MESES_NA_TENDENCIA);
  // Começa um dia antes do 1º mês da janela para absorver a diferença de fuso; o filtro fino é feito abaixo
  const inicioJanela = paraData(adicionarDias(`${meses[0]!.chave}-01`, -1));
  const verCargaDaEquipe = usuario.perfil === 'gestor';

  const [
    total,
    aguardandoValidacao,
    concluidas,
    vencidas,
    prazoCritico,
    emAndamento,
    atribuidas,
    porDemandanteBruto,
    porFiscalBruto,
    proximos,
    datas,
  ] = await Promise.all([
    contar(),
    contar(filtroStatus('em_analise', hoje)),
    contar(filtroStatus('concluida', hoje)),
    contar(filtroStatus('vencida', hoje)),
    contar(filtroStatus('prazo_critico', hoje)),
    // "Em andamento" aqui são as ativas que ainda têm folga de prazo
    contar(ATIVAS, { prazo: { gt: paraData(adicionarDias(hoje, 5)) } }),
    contar(ATIVAS, { fiscalId: { not: null } }),
    prisma.demanda.groupBy({ by: ['demandanteId'], where: onde(ATIVAS), _count: { _all: true } }),
    verCargaDaEquipe
      ? prisma.demanda.groupBy({
          by: ['fiscalId'],
          where: onde(ATIVAS, { fiscalId: { not: null } }),
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.demanda.findMany({
      where: onde(ATIVAS, {
        prazo: { gte: paraData(hoje), lte: paraData(adicionarDias(hoje, DIAS_PROXIMOS)) },
      }),
      orderBy: [{ prazo: 'asc' }, { id: 'asc' }],
      take: 5,
      include: INCLUIR_RELACOES,
    }),
    prisma.demanda.findMany({
      where: onde({
        OR: [{ createdAt: { gte: inicioJanela } }, { concluidaEm: { gte: inicioJanela } }],
      }),
      select: { createdAt: true, concluidaEm: true },
    }),
  ]);

  // Agrupa por categoria do órgão (a tabela de demandantes é pequena)
  const demandantes = await prisma.demandante.findMany({
    where: { id: { in: porDemandanteBruto.map((g) => g.demandanteId) } },
    select: { id: true, tipo: true },
  });
  const tipoPorId = new Map(demandantes.map((d) => [d.id, d.tipo]));
  const porTipo = new Map<string, number>();
  for (const grupo of porDemandanteBruto) {
    const tipo = tipoPorId.get(grupo.demandanteId);
    const rotulo = tipo ? ROTULO_TIPO_DEMANDANTE[tipo] : 'Outros';
    porTipo.set(rotulo, (porTipo.get(rotulo) ?? 0) + grupo._count._all);
  }

  const fiscais = await prisma.fiscal.findMany({
    where: { id: { in: porFiscalBruto.map((g) => g.fiscalId).filter((id): id is number => id !== null) } },
    select: { id: true, nome: true },
  });
  const nomePorId = new Map(fiscais.map((f) => [f.id, f.nome]));

  const recebidasPorMes = new Map<string, number>();
  const concluidasPorMes = new Map<string, number>();
  for (const { createdAt, concluidaEm } of datas) {
    const recebida = chaveMesNoFuso(createdAt, env.TZ_NEGOCIO);
    recebidasPorMes.set(recebida, (recebidasPorMes.get(recebida) ?? 0) + 1);
    if (concluidaEm) {
      const concluida = chaveMesNoFuso(concluidaEm, env.TZ_NEGOCIO);
      concluidasPorMes.set(concluida, (concluidasPorMes.get(concluida) ?? 0) + 1);
    }
  }

  const ordenarPorQuantidade = <T extends { quantidade: number }>(itens: T[]) =>
    itens.sort((a, b) => b.quantidade - a.quantidade);

  res.json({
    total,
    aguardandoValidacao,
    emAndamento,
    atribuidas,
    prazoCritico,
    vencidas,
    concluidas,
    porDemandante: ordenarPorQuantidade(
      [...porTipo].map(([tipo, quantidade]) => ({ tipo, quantidade })),
    ),
    // Carga da equipe é informação de gestão: os demais perfis recebem lista vazia
    cargaFiscais: ordenarPorQuantidade(
      porFiscalBruto.map((grupo) => ({
        fiscal: nomePorId.get(grupo.fiscalId!) ?? 'Sem nome',
        quantidade: grupo._count._all,
      })),
    ),
    prazosProximos: proximos.map((demanda) => ({
      numero: numeroDemanda(demanda.id),
      demandante: demanda.demandante.nome,
      assunto: demanda.assunto,
      dias: diasParaPrazo(demanda.prazo.toISOString().slice(0, 10), hoje),
    })),
    tendenciaMensal: meses.map(({ chave, mes }) => ({
      mes,
      recebidas: recebidasPorMes.get(chave) ?? 0,
      concluidas: concluidasPorMes.get(chave) ?? 0,
    })),
  });
});
