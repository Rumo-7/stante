import type { FatosParecer } from './fatos';

const NUMERO = /\d+(?:[.,]\d+)?/g;

/** "16,5" e "16.5" são o mesmo número; "4.0" é 4. */
function normalizar(token: string): string {
  const comPonto = token.replace(',', '.');
  return comPonto.includes('.') ? comPonto.replace(/0+$/, '').replace(/\.$/, '') : comPonto;
}

/**
 * Números que aparecem no texto da IA mas não estão nos dados que ela recebeu.
 * É um alerta para o gestor conferir, não uma prova de erro: um número pode ser legítimo
 * (ex.: um ano) e ainda assim merecer uma olhada.
 */
export function numerosForaDosDados(texto: string, fatos: FatosParecer): string[] {
  const permitidos = new Set((JSON.stringify(fatos).match(NUMERO) ?? []).map(normalizar));

  // A numeração de títulos e listas ("## 1.", "2)") não é dado
  const semMarcadores = texto.replace(/^[\s#*>-]*\d+[.)]\s/gm, '');

  const suspeitos: string[] = [];
  for (const token of semMarcadores.match(NUMERO) ?? []) {
    if (!permitidos.has(normalizar(token)) && !suspeitos.includes(token)) suspeitos.push(token);
  }
  return suspeitos;
}
