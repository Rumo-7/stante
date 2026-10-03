// Regras de prazo compartilhadas entre API e front.
// Datas de prazo são sempre strings "YYYY-MM-DD" (sem horário), e "hoje" é
// calculado no fuso do negócio. Assim o resultado não depende do fuso do
// servidor (o deploy roda em UTC; os usuários estão em Recife).

export const FUSO_NEGOCIO = 'America/Recife';
export const DIAS_PRAZO_CRITICO = 5;

export type StatusDemanda = 'em_analise' | 'aberta' | 'em_andamento' | 'concluida';
export type StatusExibicao = StatusDemanda | 'prazo_critico' | 'vencida';

export const STATUS_EXIBICAO = [
  'em_analise',
  'aberta',
  'em_andamento',
  'concluida',
  'prazo_critico',
  'vencida',
] as const satisfies readonly StatusExibicao[];

/** Nomes dos status gravados, como aparecem para as pessoas (histórico, listas, filtros). */
export const ROTULO_STATUS_DEMANDA: Record<StatusDemanda, string> = {
  em_analise: 'Em análise',
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
};

/** "2026-10-03" -> "03/10/2026" */
export function formatarDataBr(dataIso: string): string {
  const [ano, mes, dia] = dataIso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const FORMATO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dataIsoValida(valor: string): boolean {
  const partes = FORMATO_DATA.exec(valor);
  if (!partes) return false;
  const [, ano, mes, dia] = partes.map(Number) as [number, number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}

function paraUtc(dataIso: string): number {
  const [ano, mes, dia] = dataIso.slice(0, 10).split('-').map(Number) as [number, number, number];
  return Date.UTC(ano, mes - 1, dia);
}

export function hojeNoFuso(fuso: string = FUSO_NEGOCIO, agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(agora);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export function adicionarDias(dataIso: string, dias: number): string {
  return new Date(paraUtc(dataIso) + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

/** Dias entre hoje e o prazo. Negativo = já venceu; 0 = vence hoje. */
export function diasParaPrazo(prazo: string, hoje: string): number {
  return Math.round((paraUtc(prazo) - paraUtc(hoje)) / MS_POR_DIA);
}

/**
 * Status mostrado ao usuário: o status salvo, ajustado pela proximidade do prazo.
 * Demanda em análise (ainda não validada pelo gestor) não é formal, então o
 * prazo só passa a valer depois da validação.
 */
export function statusExibicao(status: StatusDemanda, prazo: string, hoje: string): StatusExibicao {
  if (status === 'concluida' || status === 'em_analise') return status;
  const dias = diasParaPrazo(prazo, hoje);
  if (dias < 0) return 'vencida';
  if (dias <= DIAS_PRAZO_CRITICO) return 'prazo_critico';
  return status;
}

/** Chave "YYYY-MM" de uma data ISO (usada na tendência mensal do dashboard). */
export function chaveMes(dataIso: string): string {
  return dataIso.slice(0, 7);
}

/** Mês ("YYYY-MM") em que um instante cai, no fuso do negócio. */
export function chaveMesNoFuso(instante: Date, fuso: string = FUSO_NEGOCIO): string {
  return chaveMes(hojeNoFuso(fuso, instante));
}

export const NOMES_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Os últimos `quantidade` meses, do mais antigo ao mês de `hoje`. */
export function ultimosMeses(hoje: string, quantidade: number): { chave: string; mes: string }[] {
  const [ano, mes] = hoje.split('-').map(Number) as [number, number];
  const meses: { chave: string; mes: string }[] = [];
  for (let i = quantidade - 1; i >= 0; i -= 1) {
    const data = new Date(Date.UTC(ano, mes - 1 - i, 1));
    meses.push({ chave: data.toISOString().slice(0, 7), mes: NOMES_MESES[data.getUTCMonth()]! });
  }
  return meses;
}

export function numeroDemanda(id: number): string {
  return `DEM-${String(id).padStart(4, '0')}`;
}
