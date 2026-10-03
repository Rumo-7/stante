import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { DadosDashboard } from '../api/dashboard';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export function GraficoTendencia({ dados }: { dados: DadosDashboard['tendenciaMensal'] }) {
  return (
    <Line
      data={{
        labels: dados.map((item) => item.mes),
        datasets: [
          {
            label: 'Recebidas',
            data: dados.map((item) => item.recebidas),
            borderColor: '#142721',
            backgroundColor: '#142721',
            tension: 0.35,
          },
          {
            label: 'Concluídas',
            data: dados.map((item) => item.concluidas),
            borderColor: '#315f28',
            backgroundColor: '#315f28',
            tension: 0.35,
          },
        ],
      }}
      options={{
        responsive: true,
        plugins: { legend: { position: 'top', align: 'end' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      }}
    />
  );
}
