import { diasParaPrazo } from '@stante/shared';

export type NivelDeRisco = 'medio' | 'alto';

/** Uma demanda ainda em andamento, com as datas já no formato "AAAA-MM-DD" do fuso do negócio. */
export interface DemandaParaRisco {
  id: number;
  demandanteId: number;
  fiscalId: number | null;
  status: 'aberta' | 'em_andamento';
  prazo: string;
  /** Dia em que a demanda entrou. */
  cadastro: string;
}

/** Quanto tempo a unidade costuma levar para concluir, pelo histórico (mediana) e o tamanho dele. */
export interface Ritmo {
  medianaDias: number;
  amostra: number;
}

export interface ContextoDeRisco {
  hoje: string;
  nomeDoOrgao: (demandanteId: number) => string;
  ritmoDoOrgao: Map<number, Ritmo>;
  ritmoGeral: Ritmo | null;
  /** Demandas em andamento por fiscal. */
  cargaDoFiscal: Map<number, number>;
  /** Mediana da carga da equipe (fiscais sem demanda contam como zero). */
  cargaTipicaDaEquipe: number | null;
}

export interface Risco {
  nivel: NivelDeRisco;
  pontos: number;
  /** Por que, em português, do mais pesado para o mais leve. */
  motivos: string[];
}

/** Com menos demandas que isto no histórico, o "tempo típico" seria palpite e não entra na conta. */
export const AMOSTRA_MINIMA_DO_RITMO = 3;

const PONTOS_PARA_ALTO = 3;
const PONTOS_PARA_MEDIO = 2;
const DIAS_PARA_URGENCIA_SEM_FISCAL = 7;

const numero = (n: number) => String(n).replace('.', ',');
const dias = (n: number) => `${numero(n)} ${n === 1 ? 'dia' : 'dias'}`;

/**
 * Avalia se uma demanda que ainda está no prazo tem risco de vencê-lo. É um conjunto de regras
 * simples e explicáveis, não um modelo opaco: cada ponto vem com o motivo em português.
 * Devolve null quando não há risco relevante (ou quando a demanda já venceu: essas já aparecem como vencidas).
 */
export function avaliarRisco(demanda: DemandaParaRisco, contexto: ContextoDeRisco): Risco | null {
  const restantes = diasParaPrazo(demanda.prazo, contexto.hoje);
  if (restantes < 0) return null;

  const concedido = diasParaPrazo(demanda.prazo, demanda.cadastro);
  const decorridos = Math.max(0, diasParaPrazo(contexto.hoje, demanda.cadastro));
  const motivos: { pontos: number; texto: string }[] = [];
  const emAndamento = demanda.status === 'em_andamento';

  // 1) O ritmo real: o prazo concedido cabe no tempo que a unidade costuma levar?
  const doOrgao = contexto.ritmoDoOrgao.get(demanda.demandanteId);
  const ritmoDoOrgao = doOrgao && doOrgao.amostra >= AMOSTRA_MINIMA_DO_RITMO ? doOrgao : null;
  const ritmoDaUnidade =
    contexto.ritmoGeral && contexto.ritmoGeral.amostra >= AMOSTRA_MINIMA_DO_RITMO ? contexto.ritmoGeral : null;
  const ritmo = ritmoDoOrgao ?? ritmoDaUnidade;
  const sujeito = ritmoDoOrgao ? 'Para este órgão, a unidade' : 'Na unidade, o tempo';

  if (ritmo) {
    const tipico = ritmo.medianaDias;
    const historico = `mediana de ${ritmo.amostra} demandas concluídas`;
    const base = ritmoDoOrgao
      ? `${sujeito} costuma levar ${dias(tipico)} para concluir (${historico})`
      : `${sujeito} típico para concluir é de ${dias(tipico)} (${historico})`;

    if (concedido < tipico) {
      // Quem já começou a trabalhar tem mais chance de cumprir: pesa menos
      motivos.push({
        pontos: emAndamento ? 2 : 3,
        texto: `${base}, e o prazo concedido é de ${dias(concedido)}: menor que o tempo típico.`,
      });
    } else if (concedido - tipico <= 2) {
      motivos.push({ pontos: 1, texto: `${base}, e o prazo concedido é de ${dias(concedido)}: apertado.` });
    }
    if (decorridos > tipico) {
      motivos.push({
        pontos: 1,
        texto: `Já passou do tempo típico: a demanda tem ${dias(decorridos)} e o normal é concluir em ${dias(tipico)}.`,
      });
    }
  }

  // 2) Quem vai fazer?
  if (demanda.fiscalId === null) {
    const urgente = restantes <= DIAS_PARA_URGENCIA_SEM_FISCAL;
    motivos.push({
      pontos: urgente ? 2 : 1,
      texto: urgente
        ? `Sem fiscal atribuído e faltam só ${dias(restantes)}.`
        : 'Sem fiscal atribuído.',
    });
  } else if (contexto.cargaTipicaDaEquipe !== null) {
    const carga = contexto.cargaDoFiscal.get(demanda.fiscalId) ?? 0;
    const tipica = contexto.cargaTipicaDaEquipe;
    const limite = Math.max(Math.ceil(tipica * 1.5), tipica + 2);
    if (carga >= limite) {
      motivos.push({
        pontos: 1,
        texto: `O fiscal responsável tem ${carga} demandas em andamento (a mediana da equipe é ${numero(tipica)}).`,
      });
    }
  }

  // 3) Está andando? Uma demanda que nem foi iniciada e já gastou metade do prazo preocupa
  if (!emAndamento && concedido > 0 && decorridos >= concedido / 2) {
    motivos.push({ pontos: 1, texto: 'Ainda não foi iniciada e já passou mais da metade do prazo.' });
  }

  const pontos = motivos.reduce((soma, motivo) => soma + motivo.pontos, 0);
  const nivel: NivelDeRisco | null = pontos >= PONTOS_PARA_ALTO ? 'alto' : pontos >= PONTOS_PARA_MEDIO ? 'medio' : null;
  if (!nivel) return null;

  return {
    nivel,
    pontos,
    motivos: motivos.sort((a, b) => b.pontos - a.pontos).map((motivo) => motivo.texto),
  };
}
