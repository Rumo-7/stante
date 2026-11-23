import { ROTULO_STATUS_DEMANDA } from '@stante/shared';
import { Link } from 'react-router-dom';
import { useCiclos, type Demanda } from '../api/demandas';
import { formatarInstante } from '../util/data';

/**
 * Reincidência (UH15): mostra os ciclos do mesmo caso (a demanda original e os
 * novos ciclos ligados a ela), com links para abrir cada um.
 */
export function SecaoCiclos({ demanda }: { demanda: Demanda }) {
  const ciclos = useCiclos(demanda.id);

  // Só a própria demanda na lista: não há outros ciclos para mostrar
  const temOutrosCiclos = (ciclos.data?.length ?? 0) > 1;
  const raizId = demanda.demandaOrigemId ?? demanda.id;

  if (!temOutrosCiclos) return null;

  return (
    <div className="field-group ciclos">
      <span className="detalhe-label">Ciclos deste caso</span>
      <ul className="ciclos-lista">
        {ciclos.data?.map((ciclo) => (
          <li key={ciclo.id}>
            {ciclo.id === demanda.id ? (
              <strong>{ciclo.numero}</strong>
            ) : (
              <Link to={`/demandas?abrir=${ciclo.id}`}>{ciclo.numero}</Link>
            )}
            {ciclo.id === raizId && <span className="ciclos-original"> (original)</span>}
            <span className="ciclos-info">
              {ROTULO_STATUS_DEMANDA[ciclo.status]} · {formatarInstante(ciclo.criadoEm)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
