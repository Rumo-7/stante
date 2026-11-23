import { mensagemDeErro } from '../api/cliente';
import { useHistorico } from '../api/historico';
import { formatarInstante } from '../util/data';
import { rotuloTipoHistorico } from '../util/historico';

/**
 * Histórico da demanda (UH3): quem mudou o quê e quando. Os registros são gravados
 * pela API junto com cada alteração; aqui só mostramos, do mais recente para o mais antigo.
 */
export function SecaoHistorico({ demandaId }: { demandaId: number }) {
  const historico = useHistorico(demandaId);
  // Enquanto carrega ainda não sabemos quantos são: mostra só "Histórico"
  const quantidade = historico.data ? ` (${historico.data.length})` : '';

  return (
    <details className="historico">
      <summary>Histórico{quantidade}</summary>
      {historico.isPending && <p className="empty-state">Carregando…</p>}
      {historico.error && <p className="estado-erro">{mensagemDeErro(historico.error)}</p>}
      {historico.data?.length === 0 && <p className="empty-state">Nenhum registro ainda.</p>}
      <ol className="historico-lista">
        {historico.data?.map((evento) => (
          <li key={evento.id}>
            <span className="historico-quando">{formatarInstante(evento.criadoEm)}</span>
            <span>
              <span className={`historico-tipo historico-tipo-${evento.tipo}`}>
                {rotuloTipoHistorico(evento.tipo)}
              </span>
              {evento.descricao}
            </span>
            <span className="historico-autor">{evento.autor ?? 'Usuário removido'}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
