/**
 * Nome curto para o eixo do gráfico: a sigla entre parênteses no fim do nome
 * ("Ministério Público do Trabalho (MPT)" -> "MPT") ou o nome cortado.
 */
export function rotuloCurto(nome: string, limite = 28): string {
  const sigla = /\(([^()]{2,12})\)\s*$/.exec(nome)?.[1];
  if (sigla) return sigla;
  return nome.length > limite ? `${nome.slice(0, limite - 1).trimEnd()}…` : nome;
}

/** 0,733 -> "73%". Null vira "—". */
export function formatarPorcentagem(fracao: number | null): string {
  return fracao === null ? '—' : `${Math.round(fracao * 100)}%`;
}

/** 16.5 -> "16,5 d". Null vira "—". */
export function formatarDias(dias: number | null): string {
  return dias === null ? '—' : `${String(dias).replace('.', ',')} d`;
}
