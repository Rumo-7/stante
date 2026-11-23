import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROTULO_STATUS_DEMANDA } from '@stante/shared';
import { mensagemDeErro } from '../api/cliente';
import { useCiclos, useNovoCiclo, type Demanda } from '../api/demandas';
import { useUsuarioLogado } from '../auth/rotas';
import { formatarInstante } from '../util/data';

const MSG_MOTIVO = 'Campo obrigatório: informe o motivo do novo ciclo.';

/**
 * Reincidência (UH15): mostra os ciclos do mesmo caso e, para o gestor, permite abrir
 * um novo ciclo de uma demanda concluída. O novo ciclo é outra demanda, ligada à
 * original, então o histórico da original fica intacto.
 */
export function SecaoCiclos({ demanda }: { demanda: Demanda }) {
  const usuario = useUsuarioLogado();
  const navegar = useNavigate();
  const ciclos = useCiclos(demanda.id);
  const novoCiclo = useNovoCiclo();

  const [abrindo, setAbrindo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);

  const podeAbrir = usuario.perfil === 'gestor' && demanda.statusSalvo === 'concluida';
  // Só a própria demanda na lista: não há outros ciclos para mostrar
  const temOutrosCiclos = (ciclos.data?.length ?? 0) > 1;
  const raizId = demanda.demandaOrigemId ?? demanda.id;

  if (!temOutrosCiclos && !podeAbrir) return null;

  function abrirNovoCiclo() {
    setMensagem(null);
    // Mesma regra do servidor (mínimo de 3 caracteres), para não enviar à toa
    if (motivo.trim().length < 3) {
      setMensagem(MSG_MOTIVO);
      return;
    }
    novoCiclo.mutate(
      { id: demanda.id, motivo: motivo.trim() },
      {
        // Abre o novo ciclo no lugar do atual (a página de demandas lê o ?abrir=)
        onSuccess: (nova) => navegar(`/demandas?abrir=${nova.id}`),
        onError: (erro) => setMensagem(mensagemDeErro(erro)),
      },
    );
  }

  return (
    <div className="field-group ciclos">
      {temOutrosCiclos && (
        <>
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
        </>
      )}

      {podeAbrir && !abrindo && (
        <button type="button" className="btn-secondary" onClick={() => setAbrindo(true)}>
          Abrir novo ciclo (reincidência)
        </button>
      )}

      {podeAbrir && abrindo && (
        <>
          <p className="modal-dica">
            Uma nova demanda será criada e ligada a esta. O histórico desta demanda continua preservado.
          </p>
          <div className="field-group">
            <label htmlFor="motivo-ciclo">Motivo do novo ciclo</label>
            <textarea
              id="motivo-ciclo"
              rows={3}
              maxLength={500}
              placeholder="Ex.: nova denúncia sobre o mesmo local"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <div className="ciclos-acoes">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setAbrindo(false);
                setMensagem(null);
              }}
            >
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={abrirNovoCiclo} disabled={novoCiclo.isPending}>
              {novoCiclo.isPending ? 'Abrindo…' : 'Abrir novo ciclo'}
            </button>
          </div>
        </>
      )}

      {mensagem && (
        <p className="form-message error" role="alert">
          {mensagem}
        </p>
      )}
    </div>
  );
}
