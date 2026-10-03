// Categoria do órgão demandante. Antes, o campo "tipo" repetia o próprio nome
// do órgão; agora é uma categoria de fato, e o dashboard agrupa por ela.

export const TIPOS_DEMANDANTE = [
  'ministerio_publico',
  'judiciario',
  'sindicato',
  'controle_social',
  'fiscalizacao',
  'saude',
  'cidadao',
  'outro',
] as const;

export type TipoDemandante = (typeof TIPOS_DEMANDANTE)[number];

export const ROTULO_TIPO_DEMANDANTE: Record<TipoDemandante, string> = {
  ministerio_publico: 'Ministério Público',
  judiciario: 'Judiciário',
  sindicato: 'Sindicatos',
  controle_social: 'Controle social',
  fiscalizacao: 'Fiscalização e vigilância',
  saude: 'Serviços de saúde',
  cidadao: 'Cidadãos',
  outro: 'Outros',
};
