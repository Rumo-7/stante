import { useQuery } from '@tanstack/react-query';
import { api } from './cliente';

export interface EventoHistorico {
  id: number;
  tipo: string;
  descricao: string;
  /** Null quando o usuário que fez a ação foi removido. */
  autor: string | null;
  criadoEm: string;
}

/** O histórico é interno (gestor e inspetor); para o representante a consulta nem é feita. */
export const useHistorico = (demandaId: number, habilitado = true) =>
  useQuery({
    queryKey: ['historico', demandaId],
    queryFn: () => api.get<EventoHistorico[]>(`/demandas/${demandaId}/historico`),
    enabled: habilitado,
  });
