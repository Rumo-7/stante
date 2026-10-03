/** Transforma um objeto de filtros em "?a=1&b=2", pulando o que está vazio, indefinido ou falso. */
export function montarQuery(filtros: object): string {
  const parametros = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros as Record<string, unknown>)) {
    if (valor !== undefined && valor !== null && valor !== '' && valor !== false) {
      parametros.set(chave, String(valor));
    }
  }
  const texto = parametros.toString();
  return texto ? `?${texto}` : '';
}
