import { useQuery } from '@tanstack/react-query';
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

export const useDashboard = () =>
  useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DadosDashboard>('/dashboard') });

export { mensagemDeErro };
