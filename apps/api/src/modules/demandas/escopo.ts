import type { Prisma } from '@prisma/client';
import type { UsuarioLogado } from '../../auth/sessao';

/**
 * Quais demandas cada perfil enxerga. Todas as consultas e alterações passam
 * por aqui, então uma demanda fora do escopo se comporta como inexistente (404).
 */
export function escopoDemandas(usuario: UsuarioLogado): Prisma.DemandaWhereInput {
  switch (usuario.perfil) {
    case 'gestor':
      return {};
    case 'inspetor':
      // Só as demandas em que ele é o fiscal (inclui as que ele mesmo abriu em campo)
      return usuario.fiscalId ? { fiscalId: usuario.fiscalId } : NADA;
    case 'representante':
      // Só o órgão dele, e nunca o que ainda está em análise interna
      return usuario.demandanteId
        ? { demandanteId: usuario.demandanteId, status: { not: 'em_analise' } }
        : NADA;
  }
}

const NADA: Prisma.DemandaWhereInput = { id: -1 };
