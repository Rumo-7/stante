import { useSugestoesFiscais } from '../api/fiscais';

/**
 * Escolha do fiscal para uma demanda: a lista vem ordenada do mais ao menos indicado
 * (pela carga de trabalho de hoje), mostra quantas demandas cada um tem, e oferece
 * aplicar a sugestão com um clique. A decisão continua sendo do gestor.
 */
export function SeletorFiscal({
  id,
  valor,
  aoMudar,
  demandanteId,
  fiscalAtual = null,
}: {
  id: string;
  valor: string;
  aoMudar: (fiscalId: string) => void;
  /** Órgão da demanda: quem já o atendeu tem pequena preferência em caso de empate. */
  demandanteId: number | null;
  /** O fiscal já atribuído, para continuar aparecendo mesmo que saia do ranking (ex.: acesso bloqueado). */
  fiscalAtual?: { id: number; nome: string } | null;
}) {
  const sugestoes = useSugestoesFiscais(demandanteId, true);
  const lista = sugestoes.data ?? [];
  const sugerido = lista.find((item) => item.sugerido);
  const atualForaDoRanking = fiscalAtual && !lista.some((item) => item.fiscalId === fiscalAtual.id);

  return (
    <>
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)}>
        <option value="">Não atribuído</option>
        {lista.map((item) => (
          <option key={item.fiscalId} value={item.fiscalId}>
            {item.nome} — {item.ativas} ativa{item.ativas === 1 ? '' : 's'}
            {item.sugerido ? ' · sugerido' : ''}
          </option>
        ))}
        {atualForaDoRanking && (
          <option value={fiscalAtual.id}>{fiscalAtual.nome} (atual)</option>
        )}
      </select>

      {sugestoes.error && <p className="sugestao-fiscal">Não foi possível calcular a sugestão.</p>}
      {sugerido && String(sugerido.fiscalId) !== valor && (
        <p className="sugestao-fiscal">
          Sugestão: <strong>{sugerido.nome}</strong> ({sugerido.resumo}){' '}
          <button type="button" className="sino-acao" onClick={() => aoMudar(String(sugerido.fiscalId))}>
            Usar
          </button>
        </p>
      )}
    </>
  );
}
