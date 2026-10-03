import { useQuery } from '@tanstack/react-query';
import { montarQuery } from '../util/query';
import { api, mensagemDeErro } from './cliente';

export interface DadosDashboard {
  total: number;
  aguardandoValidacao: number;
  emAndamento: number;
  atribuidas: number;
  prazoCritico: number;
  vencidas: number;
  concluidas: number;
  porDemandante: { tipo: string; quantidade: number }[];
  cargaFiscais: { fiscal: string; quantidade: number }[];
  prazosProximos: { numero: string; demandante: string; assunto: string; dias: number }[];
  tendenciaMensal: { mes: string; recebidas: number; concluidas: number }[];
}

/** O período é o de cadastro ("recebidas entre"); a tendência mensal o ignora. */
export interface FiltrosDashboard {
  de?: string;
  ate?: string;
  fiscalId?: string;
  demandanteId?: string;
}

export const useDashboard = (filtros: FiltrosDashboard = {}) =>
  useQuery({
    queryKey: ['dashboard', filtros],
    queryFn: () => api.get<DadosDashboard>(`/dashboard${montarQuery(filtros)}`),
  });

export { mensagemDeErro };
