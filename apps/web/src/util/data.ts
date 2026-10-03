import { FUSO_NEGOCIO } from '@stante/shared';

/** "2026-10-03" -> "03/10/2026" */
export function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Um instante (ex.: "2026-10-03T14:05:00.000Z") como "03/10/2026 11:05", no fuso de Recife. */
export function formatarInstante(instanteIso: string): string {
  return new Date(instanteIso).toLocaleString('pt-BR', {
    timeZone: FUSO_NEGOCIO,
    dateStyle: 'short',
    timeStyle: 'short',
  });
}
