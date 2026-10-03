import type { ItemDoRadar } from '../api/radar';

/** Selo pequeno de "o Radar vê risco de atraso aqui". O porquê completo está na tela da Sentinela. */
export function RadarSelo({ item }: { item: ItemDoRadar | undefined }) {
  if (!item) return null;
  const rotulo = item.nivel === 'alto' ? 'Radar: risco alto' : 'Radar: risco médio';
  return (
    <span className={`radar-selo radar-${item.nivel}`} title={item.motivos.join('\n')}>
      {rotulo}
    </span>
  );
}
