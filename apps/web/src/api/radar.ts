import { useQuery } from '@tanstack/react-query';
import { api } from './cliente';

export interface ItemDoRadar {
  demandaId: number;
  numero: string;
  assunto: string;
  demandante: string;
  fiscal: string | null;
  prazo: string;
  diasRestantes: number;
  nivel: 'medio' | 'alto';
  motivos: string[];
}

export interface ResultadoDoRadar {
  itens: ItemDoRadar[];
  totais: { alto: number; medio: number };
}

/** Só gestor e inspetor têm o Radar; para o representante a consulta nem é feita. */
export const useRadar = (habilitado: boolean) =>
  useQuery({
    queryKey: ['radar'],
    queryFn: () => api.get<ResultadoDoRadar>('/radar'),
    enabled: habilitado,
    // O risco muda com o passar dos dias: atualiza sozinho enquanto a aba está aberta
    refetchInterval: 5 * 60_000,
  });

/** Para achar o risco de uma demanda pelo id (lista, prazos, calendário). */
export const mapaDoRadar = (resultado: ResultadoDoRadar | undefined) =>
  new Map((resultado?.itens ?? []).map((item) => [item.demandaId, item]));
