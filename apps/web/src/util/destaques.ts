import type { EstatisticasOrgao } from '../api/demandantes';

/**
 * Taxas calculadas com poucas demandas enganam (1 de 1 é "100%"). Abaixo disto o órgão
 * aparece nos números, mas não é apontado como melhor nem pior em nada.
 */
export const AMOSTRA_MINIMA = 3;

export interface Destaque {
  chave: 'volume' | 'pontual' | 'atrasado' | 'demorado' | 'vencidas';
  titulo: string;
  orgao: string;
  detalhe: string;
  tom: 'neutro' | 'bom' | 'atencao';
}

const porcento = (fracao: number) => `${Math.round(fracao * 100)}%`;
const plural = (n: number, singular: string, pluralForma: string) => `${n} ${n === 1 ? singular : pluralForma}`;

/** Quantas demandas entram na conta da pontualidade: as entregues e as vencidas sem resposta. */
const basePontualidade = (o: EstatisticasOrgao) => o.noPrazo + o.foraDoPrazo + o.vencidas;

/** Leituras automáticas dos números, só com o que tem base suficiente para ser dito. */
export function calcularDestaques(orgaos: EstatisticasOrgao[], totalRecebidas: number): Destaque[] {
  const destaques: Destaque[] = [];

  const maisDemandas = orgaos.reduce<EstatisticasOrgao | null>(
    (melhor, o) => (o.recebidas > (melhor?.recebidas ?? 0) ? o : melhor),
    null,
  );
  if (maisDemandas && totalRecebidas > 0) {
    destaques.push({
      chave: 'volume',
      titulo: 'Quem mais envia',
      orgao: maisDemandas.nome,
      detalhe: `${plural(maisDemandas.recebidas, 'demanda', 'demandas')} (${porcento(maisDemandas.recebidas / totalRecebidas)} do total)`,
      tom: 'neutro',
    });
  }

  const comPontualidade = orgaos.filter((o) => o.pontualidade !== null && basePontualidade(o) >= AMOSTRA_MINIMA);
  if (comPontualidade.length >= 2) {
    const ordenados = [...comPontualidade].sort((a, b) => b.pontualidade! - a.pontualidade! || b.recebidas - a.recebidas);
    const melhor = ordenados[0]!;
    const pior = ordenados[ordenados.length - 1]!;
    destaques.push({
      chave: 'pontual',
      titulo: 'Mais pontual',
      orgao: melhor.nome,
      detalhe: `${porcento(melhor.pontualidade!)} dentro do prazo`,
      tom: 'bom',
    });
    // Se todos empatam, não existe "pior"
    if (pior.pontualidade! < melhor.pontualidade!) {
      destaques.push({
        chave: 'atrasado',
        titulo: 'Menos pontual',
        orgao: pior.nome,
        detalhe: `${porcento(pior.pontualidade!)} dentro do prazo`,
        tom: 'atencao',
      });
    }
  }

  const comTempo = orgaos.filter((o) => o.medianaDias !== null && o.concluidas >= AMOSTRA_MINIMA);
  if (comTempo.length > 0) {
    const maisDemorado = comTempo.reduce((a, b) => (b.medianaDias! > a.medianaDias! ? b : a));
    const concedido = maisDemorado.prazoConcedidoMedianoDias;
    destaques.push({
      chave: 'demorado',
      titulo: 'Leva mais tempo para concluir',
      orgao: maisDemorado.nome,
      detalhe:
        `mediana de ${maisDemorado.medianaDias} dias` +
        (concedido !== null ? `; o prazo costuma ser de ${concedido} dias` : ''),
      tom: 'atencao',
    });
  }

  const comVencidas = orgaos.filter((o) => o.vencidas > 0);
  if (comVencidas.length > 0) {
    const maisVencidas = comVencidas.reduce((a, b) => (b.vencidas > a.vencidas ? b : a));
    destaques.push({
      chave: 'vencidas',
      titulo: 'Mais demandas vencidas hoje',
      orgao: maisVencidas.nome,
      detalhe: `${maisVencidas.vencidas} de ${plural(maisVencidas.recebidas, 'demanda', 'demandas')}`,
      tom: 'atencao',
    });
  }

  return destaques;
}
