import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './cliente';
import { invalidarDemandas } from './demandas';

/** Uma linha da planilha como a API analisou. */
export interface LinhaImportacao {
  linha: number;
  /** Vazio = a linha será (ou foi) importada. */
  erros: string[];
  processoSei: string | null;
  demandante: string;
  assunto: string;
  prazo: string | null;
  fiscal: string | null;
  situacao: string;
}

export interface ResultadoImportacao {
  colunas: {
    reconhecidas: { coluna: string; campo: string }[];
    ignoradas: string[];
  };
  linhas: LinhaImportacao[];
  totais: { validas: number; comErro: number };
  /** Só na importação de fato: quantas demandas foram criadas. */
  criadas?: number;
}

const comArquivo = (arquivo: File) => {
  const formulario = new FormData();
  formulario.append('arquivo', arquivo);
  return formulario;
};

/** Analisa a planilha e mostra o que seria importado. Não grava nada. */
export const usePreviaImportacao = () =>
  useMutation({
    mutationFn: (arquivo: File) => api.post<ResultadoImportacao>('/demandas/importacao/previa', comArquivo(arquivo)),
  });

/** Importa as linhas válidas e atualiza as telas que dependem das demandas. */
export function useImportarDemandas() {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: (arquivo: File) => api.post<ResultadoImportacao>('/demandas/importacao', comArquivo(arquivo)),
    onSuccess: () => invalidarDemandas(clienteQuery),
  });
}

/**
 * Planilha de exemplo para a VISAT ajustar a dela. Separada por ";" e com BOM, que é o que o
 * Excel em português espera para abrir com as colunas e os acentos certos.
 */
const MODELO_CSV = [
  'Processo SEI;Data de recebimento;Órgão demandante;Tipo de documento;Nº do documento;Assunto;Prazo;Responsável;Situação;Observações',
  '25000.012345/2026-11;03/11/2026;MPT;Ofício;123/2026;Solicita inspeção em frigorífico após acidente com amputação;03/12/2026;Carlos Melo;Aberta;',
  '25000.013002/2026-40;05/11/2026;Justiça do Trabalho;Requisição;0045/2026;Laudo sobre exposição a ruído em metalúrgica;;;Em andamento;Prazo a confirmar com a vara',
].join('\r\n');

export function baixarModeloCsv() {
  const arquivo = new Blob(['\uFEFF', MODELO_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'modelo-importacao-demandas.csv';
  link.click();
  URL.revokeObjectURL(url);
}
