import type { TipoDemandante } from '@prisma/client';
import {
  adicionarDias,
  chaveMesNoFuso,
  formatarDataBr,
  hojeNoFuso,
  inicioDoDia,
  NOMES_MESES,
  ROTULO_TIPO_DEMANDANTE,
  type PeriodoDoParecer,
} from '@stante/shared';
import { prisma } from '../../db';
import { env } from '../../env';
import { agregarPorOrgao, type OrgaoBase } from '../demandantes/estatisticas';
import { filtroPeriodoDeCadastro } from '../demandas/filtros';

/**
 * Tudo o que a IA recebe. São números já calculados pelo nosso código e textos curtos e públicos
 * (nomes de órgãos e categorias). NÃO entram: assunto das demandas (pode citar empresa ou denúncia),
 * nome de fiscal ou de usuário, e-mails, anexos.
 */
export interface FatosParecer {
  unidade: string;
  periodo: { de: string; ate: string; rotulo: string };
  demandas: {
    recebidas: number;
    concluidas: number;
    taxaConclusaoPct: number | null;
    emAberto: number;
    vencidas: number;
    concluidasNoPrazo: number;
    concluidasForaDoPrazo: number;
    pontualidadePct: number | null;
    tempoMedianoParaConcluirDias: number | null;
    prazoConcedidoMedianoDias: number | null;
    abertasEmCampo: number;
    reaberturas: number;
    reaberturasPct: number | null;
  };
  porCategoriaDeOrgao: {
    categoria: string;
    recebidas: number;
    concluidas: number;
    taxaConclusaoPct: number | null;
    pontualidadePct: number | null;
  }[];
  principaisOrgaos: {
    nome: string;
    recebidas: number;
    participacaoPct: number;
    concluidas: number;
    vencidas: number;
    pontualidadePct: number | null;
    tempoMedianoParaConcluirDias: number | null;
  }[];
  tendenciaMensal: { mes: string; recebidas: number; concluidas: number }[];
  equipe: { fiscaisAtivos: number; mediaDeDemandasPorFiscal: number | null };
  /** Informações que um parecer desse tipo costuma pedir e que o sistema NÃO registra. */
  naoDisponivelNoSistema: string[];
}

const NAO_DISPONIVEL = [
  'Notificações de agravos e acidentes de trabalho (SINAN)',
  'Setor econômico (CNAE) e ocupação (CBO) dos casos',
  'Interdições, notificações e autos emitidos pelas equipes',
  'Verificação da adequação das empresas após a ação da vigilância',
  'Metas pactuadas e indicadores oficiais do SUS',
];

const MAXIMO_DE_ORGAOS = 5;
const MAXIMO_DE_MESES = 12;

const pct = (fracao: number | null) => (fracao === null ? null : Math.round(fracao * 100));
const arredondar = (valor: number) => Math.round(valor * 10) / 10;

/** Os meses do período, do primeiro ao último (no máximo os 12 mais recentes). */
function mesesDoPeriodo(de: string, ate: string): { chave: string; rotulo: string }[] {
  const [anoInicial, mesInicial] = de.split('-').map(Number) as [number, number];
  const [anoFinal, mesFinal] = ate.split('-').map(Number) as [number, number];
  const meses: { chave: string; rotulo: string }[] = [];
  for (let ano = anoInicial, mes = mesInicial; ano < anoFinal || (ano === anoFinal && mes <= mesFinal); ) {
    meses.push({ chave: `${ano}-${String(mes).padStart(2, '0')}`, rotulo: `${NOMES_MESES[mes - 1]}/${ano}` });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses.slice(-MAXIMO_DE_MESES);
}

export async function montarFatos(
  periodo: PeriodoDoParecer,
  hoje: string = hojeNoFuso(env.TZ_NEGOCIO),
): Promise<FatosParecer> {
  const fuso = env.TZ_NEGOCIO;
  // Demandas em análise ainda não são trabalho formal da unidade e ficam de fora
  const cohort = { AND: [{ status: { not: 'em_analise' as const } }, ...filtroPeriodoDeCadastro(periodo.de, periodo.ate)] };

  const [orgaos, demandas, reaberturas, concluidasNoPeriodo, fiscaisAtivos] = await Promise.all([
    prisma.demandante.findMany({ select: { id: true, nome: true, tipo: true } }),
    prisma.demanda.findMany({
      where: cohort,
      select: {
        demandanteId: true,
        status: true,
        prazo: true,
        createdAt: true,
        concluidaEm: true,
        origem: true,
        fiscalId: true,
      },
    }),
    prisma.historicoDemanda.count({ where: { tipo: 'reaberta', demanda: { is: cohort } } }),
    prisma.demanda.findMany({
      where: {
        status: 'concluida',
        concluidaEm: { gte: inicioDoDia(periodo.de, fuso), lt: inicioDoDia(adicionarDias(periodo.ate, 1), fuso) },
      },
      select: { concluidaEm: true },
    }),
    prisma.fiscal.count({ where: { OR: [{ userId: null }, { user: { status: { not: 'bloqueado' } } }] } }),
  ]);

  const { orgaos: porOrgao, resumo } = agregarPorOrgao(orgaos, demandas, hoje, fuso);

  // Mesma conta, agora por categoria de órgão (cada categoria vira um "órgão" de mentira)
  const categorias = [...new Set(orgaos.map((o) => o.tipo))];
  const idDaCategoria = new Map<TipoDemandante, number>(categorias.map((tipo, i) => [tipo, i + 1]));
  const tipoDoOrgao = new Map(orgaos.map((o) => [o.id, o.tipo]));
  const categoriasBase: OrgaoBase[] = categorias.map((tipo) => ({ id: idDaCategoria.get(tipo)!, nome: ROTULO_TIPO_DEMANDANTE[tipo], tipo }));
  const porCategoria = agregarPorOrgao(
    categoriasBase,
    demandas.map((d) => ({ ...d, demandanteId: idDaCategoria.get(tipoDoOrgao.get(d.demandanteId)!)! })),
    hoje,
    fuso,
  ).orgaos;

  const totais = porOrgao.reduce(
    (soma, o) => ({ noPrazo: soma.noPrazo + o.noPrazo, foraDoPrazo: soma.foraDoPrazo + o.foraDoPrazo, emAberto: soma.emAberto + o.emAberto, vencidas: soma.vencidas + o.vencidas }),
    { noPrazo: 0, foraDoPrazo: 0, emAberto: 0, vencidas: 0 },
  );

  // Prazo que o conjunto dos órgãos costuma conceder: mediana de todos os prazos concedidos
  const prazosConcedidos = agregarPorOrgao([{ id: 0, nome: 'todos', tipo: 'outro' }], demandas.map((d) => ({ ...d, demandanteId: 0 })), hoje, fuso).orgaos[0]!;

  const recebidasPorMes = new Map<string, number>();
  for (const d of demandas) {
    const mes = chaveMesNoFuso(d.createdAt, fuso);
    recebidasPorMes.set(mes, (recebidasPorMes.get(mes) ?? 0) + 1);
  }
  const concluidasPorMes = new Map<string, number>();
  for (const d of concluidasNoPeriodo) {
    if (!d.concluidaEm) continue;
    const mes = chaveMesNoFuso(d.concluidaEm, fuso);
    concluidasPorMes.set(mes, (concluidasPorMes.get(mes) ?? 0) + 1);
  }

  const comFiscal = demandas.filter((d) => d.fiscalId !== null).length;

  return {
    unidade: env.UNIDADE_NOME,
    periodo: {
      de: periodo.de,
      ate: periodo.ate,
      rotulo: `${formatarDataBr(periodo.de)} a ${formatarDataBr(periodo.ate)}`,
    },
    demandas: {
      recebidas: resumo.recebidas,
      concluidas: resumo.concluidas,
      taxaConclusaoPct: pct(resumo.taxaConclusao),
      emAberto: totais.emAberto,
      vencidas: totais.vencidas,
      concluidasNoPrazo: totais.noPrazo,
      concluidasForaDoPrazo: totais.foraDoPrazo,
      pontualidadePct: pct(resumo.pontualidade),
      tempoMedianoParaConcluirDias: resumo.medianaDias,
      prazoConcedidoMedianoDias: prazosConcedidos.prazoConcedidoMedianoDias,
      abertasEmCampo: demandas.filter((d) => d.origem === 'campo').length,
      reaberturas,
      reaberturasPct: resumo.recebidas === 0 ? null : pct(reaberturas / resumo.recebidas),
    },
    porCategoriaDeOrgao: porCategoria
      .filter((c) => c.recebidas > 0)
      .map((c) => ({
        categoria: c.nome,
        recebidas: c.recebidas,
        concluidas: c.concluidas,
        taxaConclusaoPct: pct(c.taxaConclusao),
        pontualidadePct: pct(c.pontualidade),
      })),
    principaisOrgaos: porOrgao
      .filter((o) => o.recebidas > 0)
      .slice(0, MAXIMO_DE_ORGAOS)
      .map((o) => ({
        nome: o.nome,
        recebidas: o.recebidas,
        participacaoPct: Math.round((o.recebidas / resumo.recebidas) * 100),
        concluidas: o.concluidas,
        vencidas: o.vencidas,
        pontualidadePct: pct(o.pontualidade),
        tempoMedianoParaConcluirDias: o.medianaDias,
      })),
    tendenciaMensal: mesesDoPeriodo(periodo.de, periodo.ate).map(({ chave, rotulo }) => ({
      mes: rotulo,
      recebidas: recebidasPorMes.get(chave) ?? 0,
      concluidas: concluidasPorMes.get(chave) ?? 0,
    })),
    equipe: {
      fiscaisAtivos,
      mediaDeDemandasPorFiscal: fiscaisAtivos === 0 ? null : arredondar(comFiscal / fiscaisAtivos),
    },
    naoDisponivelNoSistema: NAO_DISPONIVEL,
  };
}
