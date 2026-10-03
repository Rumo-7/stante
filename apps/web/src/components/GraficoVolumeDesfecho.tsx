import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { EstatisticasOrgao } from '../api/demandantes';
import { rotuloCurto } from '../util/orgaos';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export const MAXIMO_NO_GRAFICO = 10;

const semData = (o: EstatisticasOrgao) => o.concluidas - o.noPrazo - o.foraDoPrazo;

const SERIES: { rotulo: string; cor: string; valor: (o: EstatisticasOrgao) => number }[] = [
  { rotulo: 'Concluídas no prazo', cor: '#315f28', valor: (o) => o.noPrazo },
  { rotulo: 'Concluídas fora do prazo', cor: '#cc8712', valor: (o) => o.foraDoPrazo },
  { rotulo: 'Concluídas (sem data registrada)', cor: '#a8c3a2', valor: semData },
  { rotulo: 'Em aberto, dentro do prazo', cor: '#8f9c96', valor: (o) => o.emAberto - o.vencidas },
  { rotulo: 'Vencidas', cor: '#b3261e', valor: (o) => o.vencidas },
];

/**
 * O gráfico principal: o comprimento da barra é quanto o órgão envia; as cores mostram
 * como essas demandas terminam. Quem envia mais e quem fica atrasado saltam aos olhos juntos.
 */
export function GraficoVolumeDesfecho({ orgaos }: { orgaos: EstatisticasOrgao[] }) {
  const lista = orgaos.filter((o) => o.recebidas > 0).slice(0, MAXIMO_NO_GRAFICO);
  // Cores que ninguém usa não entram na legenda
  const series = SERIES.filter((serie) => lista.some((o) => serie.valor(o) > 0));

  return (
    <div
      style={{ height: Math.max(220, lista.length * 42 + 96) }}
      role="img"
      aria-label="Demandas recebidas por órgão, separadas entre concluídas no prazo, concluídas fora do prazo, em aberto e vencidas. Os mesmos números estão na tabela abaixo."
    >
      <Bar
        data={{
          labels: lista.map((o) => rotuloCurto(o.nome)),
          datasets: series.map((serie) => ({
            label: serie.rotulo,
            data: lista.map(serie.valor),
            backgroundColor: serie.cor,
            borderWidth: 0,
          })),
        }}
        options={{
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
            y: { stacked: true },
          },
          plugins: {
            legend: { position: 'top', align: 'end' },
            tooltip: {
              callbacks: {
                title: (itens) => lista[itens[0]?.dataIndex ?? 0]?.nome ?? '',
                footer: (itens) => {
                  const orgao = lista[itens[0]?.dataIndex ?? 0];
                  return orgao ? `Total recebido: ${orgao.recebidas}` : '';
                },
              },
            },
          },
        }}
      />
    </div>
  );
}
