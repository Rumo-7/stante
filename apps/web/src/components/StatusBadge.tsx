import type { StatusExibicao } from '@stante/shared';

const BADGES: Record<StatusExibicao, { rotulo: string; classe: string }> = {
  em_analise: { rotulo: 'EM ANÁLISE', classe: 'badge-blue' },
  aberta: { rotulo: 'ABERTA', classe: 'badge-gray' },
  em_andamento: { rotulo: 'EM ANDAMENTO', classe: 'badge-gray' },
  prazo_critico: { rotulo: 'PRAZO', classe: 'badge-amber' },
  vencida: { rotulo: 'VENCIDA', classe: 'badge-red' },
  concluida: { rotulo: 'CONCLUÍDA', classe: 'badge-green' },
};

export function StatusBadge({ status }: { status: StatusExibicao }) {
  const { rotulo, classe } = BADGES[status];
  return <span className={`badge ${classe}`}>{rotulo}</span>;
}
