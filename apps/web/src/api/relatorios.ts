import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PeriodoDoParecer } from '@stante/shared';
import { montarQuery } from '../util/query';
import { api } from './cliente';

/** Os números que a IA recebe (só o que a tela mostra; o formato completo está na API). */
export interface FatosParecer {
  unidade: string;
  periodo: { de: string; ate: string; rotulo: string };
  demandas: {
    recebidas: number;
    concluidas: number;
    taxaConclusaoPct: number | null;
    emAberto: number;
    vencidas: number;
    pontualidadePct: number | null;
    tempoMedianoParaConcluirDias: number | null;
    reaberturas: number;
    abertasEmCampo: number;
  };
  naoDisponivelNoSistema: string[];
}

export interface Parecer {
  id: number;
  periodo: { de: string; ate: string };
  texto: string;
  fatos: FatosParecer;
  modelo: string;
  /** Números do texto que não estavam nos dados enviados à IA: o gestor deve conferir. */
  numerosParaConferir: string[];
  geradoPor: string | null;
  criadoEm: string;
}

export type ResumoDeParecer = Omit<Parecer, 'texto' | 'fatos'>;

export const useConfiguracaoDaIA = () =>
  useQuery({
    queryKey: ['relatorios', 'configuracao'],
    queryFn: () => api.get<{ iaDisponivel: boolean; modelo: string | null }>('/relatorios/configuracao'),
    staleTime: 60_000,
  });

/** Os números do período, sem gastar IA: o gestor vê a base antes de pedir o texto. */
export const useFatosDoParecer = (periodo: PeriodoDoParecer, habilitado: boolean) =>
  useQuery({
    queryKey: ['relatorios', 'fatos', periodo],
    queryFn: () => api.get<FatosParecer>(`/relatorios/fatos${montarQuery(periodo)}`),
    enabled: habilitado,
  });

export const useListaDePareceres = () =>
  useQuery({ queryKey: ['relatorios', 'lista'], queryFn: () => api.get<ResumoDeParecer[]>('/relatorios') });

export const useParecer = (id: number | null) =>
  useQuery({
    queryKey: ['relatorios', 'parecer', id],
    queryFn: () => api.get<Parecer>(`/relatorios/${id}`),
    enabled: id !== null,
  });

export function useGerarParecer() {
  const clienteQuery = useQueryClient();
  return useMutation({
    mutationFn: (periodo: PeriodoDoParecer) => api.post<Parecer>('/relatorios/parecer', periodo),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['relatorios', 'lista'] }),
  });
}
