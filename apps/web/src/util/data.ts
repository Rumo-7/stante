/** "2026-10-03" -> "03/10/2026" */
export function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}
