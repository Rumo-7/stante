/** Os tipos de registro que a API grava no histórico (enum TipoHistorico no schema.prisma). */
export type TipoHistorico =
  | 'criada'
  | 'validada'
  | 'status_alterado'
  | 'reaberta'
  | 'fiscal_alterado'
  | 'prazo_alterado'
  | 'assunto_alterado'
  | 'anexo_adicionado'
  | 'anexo_removido'
  | 'novo_ciclo'
  | 'ciclo_vinculado';

/** Nome curto de cada tipo, usado na etiqueta antes de cada registro do histórico. */
export const ROTULO_TIPO_HISTORICO: Record<TipoHistorico, string> = {
  criada: 'Criação',
  validada: 'Validação',
  status_alterado: 'Status',
  reaberta: 'Reabertura',
  fiscal_alterado: 'Fiscal',
  prazo_alterado: 'Prazo',
  assunto_alterado: 'Assunto',
  anexo_adicionado: 'Anexo',
  anexo_removido: 'Anexo',
  novo_ciclo: 'Ciclo',
  ciclo_vinculado: 'Ciclo',
};

/** Se a API mandar um tipo novo que a tela ainda não conhece, mostra um nome genérico em vez de quebrar. */
export function rotuloTipoHistorico(tipo: string): string {
  return ROTULO_TIPO_HISTORICO[tipo as TipoHistorico] ?? 'Alteração';
}
