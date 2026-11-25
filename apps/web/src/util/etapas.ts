import { ehRetornoDeEtapa } from '@stante/shared';

/** Indica se a etapa escolhida na tela é anterior à etapa atual da demanda. */
export function ehEtapaAnterior(atual: string, escolhida: string): boolean {
  return ehRetornoDeEtapa(atual, escolhida);
}
