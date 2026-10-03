import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { EstatisticasOrgao } from '../api/demandantes';
import { AMOSTRA_MINIMA } from '../util/destaques';
import { rotuloCurto } from '../util/orgaos';
import { MAXIMO_NO_GRAFICO } from './GraficoVolumeDesfecho';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

/** Órgãos com amostra suficiente para falar de tempo, do que mais demora para o que menos demora. */
export function orgaosParaTempo(orgaos: EstatisticasOrgao[]): EstatisticasOrgao[] {
  return orgaos
    .filter((o) => o.medianaDias !== null && o.concluidas >= AMOSTRA_MINIMA)
    .sort((a, b) => b.medianaDias! - a.medianaDias!)
    .slice(0, MAXIMO_NO_GRAFICO);
}

/**
 * Demorar 10 dias é lento para quem deu 7 e rápido para quem deu 30: por isso o tempo real
 * é mostrado ao lado do prazo que o órgão costuma conceder.
 */
export function GraficoTempo({ orgaos }: { orgaos: EstatisticasOrgao[] }) {
  const lista = orgaosParaTempo(orgaos);

  return (
    <div
      style={{ height: Math.max(220, lista.length * 52 + 90) }}
      role="img"
      aria-label="Tempo mediano para concluir e prazo concedido, em dias, por órgão. Os mesmos números estão na tabela abaixo."
    >
      <Bar
        data={{
          labels: lista.map((o) => rotuloCurto(o.nome)),
          datasets: [
            {
              label: 'Tempo mediano para concluir (dias)',
              data: lista.map((o) => o.medianaDias),
              backgroundColor: '#142721',
            },
            {
              label: 'Prazo concedido, mediana (dias)',
              data: lista.map((o) => o.prazoConcedidoMedianoDias),
              backgroundColor: '#e0a526',
            },
          ],
        }}
        options={{
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { beginAtZero: true } },
          plugins: {
            legend: { position: 'top', align: 'end' },
            tooltip: { callbacks: { title: (itens) => lista[itens[0]?.dataIndex ?? 0]?.nome ?? '' } },
          },
        }}
      />
    </div>
  );
}
