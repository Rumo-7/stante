import { useMemo, useState } from 'react';
import { mensagemDeErro } from '../api/cliente';
import { useDemanda } from '../api/demandas';
import { useRadar, type ItemDoRadar } from '../api/radar';
import { useUsuarioLogado } from '../auth/rotas';
import { DetalheDemandaModal } from '../components/DetalheDemandaModal';
import { formatarData } from '../util/data';

function CartaoDeRisco({ item, aoAbrir }: { item: ItemDoRadar; aoAbrir: () => void }) {
  const prazoCurto = item.diasRestantes === 0 ? 'vence hoje' : `faltam ${item.diasRestantes} dia${item.diasRestantes === 1 ? '' : 's'}`;

  return (
    <article className={`risco-cartao risco-${item.nivel}`}>
      <header className="risco-cabecalho">
        <span className={`radar-selo radar-${item.nivel}`}>{item.nivel === 'alto' ? 'Risco alto' : 'Risco médio'}</span>
        <strong>
          {item.numero} · {item.demandante}
        </strong>
      </header>
      <p className="risco-assunto">{item.assunto}</p>
      <p className="risco-meta">
        Prazo {formatarData(item.prazo)} ({prazoCurto}) · {item.fiscal ?? 'sem fiscal atribuído'}
      </p>
      <ul className="risco-motivos">
        {item.motivos.map((motivo) => (
          <li key={motivo}>{motivo}</li>
        ))}
      </ul>
      <button type="button" className="btn-ver" onClick={aoAbrir}>
        Ver demanda
      </button>
    </article>
  );
}

export function Sentinela() {
  const usuario = useUsuarioLogado();
  const radar = useRadar(true);
  const [idAberto, setIdAberto] = useState<number | null>(null);
  const detalhe = useDemanda(idAberto);

  const dados = radar.data;
  const itens = useMemo(() => dados?.itens ?? [], [dados]);

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Sentinela</h1>
          <p className="page-subtitle">
            {usuario.perfil === 'gestor'
              ? 'Vigilância sobre os prazos da unidade: o que ainda está no prazo, mas pode não ficar'
              : 'Suas demandas que ainda estão no prazo, mas podem não ficar'}
          </p>
        </div>
      </header>

      <section className="card">
        <h2>Radar de prazos</h2>
        <p className="card-subtitle">
          O Radar não espera a demanda ficar crítica: compara o prazo concedido com o tempo que a unidade de fato leva
          para cada órgão, e considera fiscal ausente, fiscal sobrecarregado e demanda parada.
        </p>

        {radar.isPending && <p>Calculando…</p>}
        {radar.error && <p className="estado-erro">{mensagemDeErro(radar.error)}</p>}

        {dados && (
          <div className="radar-totais">
            <div className="radar-total radar-total-alto">
              <strong>{dados.totais.alto}</strong>
              <span>risco alto</span>
            </div>
            <div className="radar-total radar-total-medio">
              <strong>{dados.totais.medio}</strong>
              <span>risco médio</span>
            </div>
          </div>
        )}

        <details className="como-decide">
          <summary>Como o Radar decide</summary>
          <ul>
            <li>
              <strong>Ritmo do órgão (3 pontos):</strong> o prazo concedido é menor que o tempo típico (mediana do último
              ano, com pelo menos 3 demandas concluídas). Se a demanda já está em andamento, vale 2 pontos.
            </li>
            <li>
              <strong>Prazo apertado (1 ponto):</strong> a folga sobre o tempo típico é de até 2 dias. Passar do tempo
              típico ainda aberta soma mais 1.
            </li>
            <li>
              <strong>Sem fiscal (1 ponto, ou 2 se faltam 7 dias ou menos).</strong> <strong>Fiscal sobrecarregado (1
              ponto):</strong> bem acima da mediana da equipe.
            </li>
            <li>
              <strong>Não iniciada (1 ponto):</strong> já passou mais da metade do prazo sem começar.
            </li>
            <li>
              <strong>2 pontos = risco médio; 3 ou mais = risco alto.</strong> Demandas vencidas ficam de fora: elas já
              aparecem como vencidas.
            </li>
          </ul>
          <p className="card-subtitle">
            É uma estimativa baseada no histórico, não uma previsão exata. Quando faltam dados (órgão com poucas demandas
            concluídas), o Radar usa o ritmo da unidade toda ou não opina.
          </p>
        </details>
      </section>

      {dados && itens.length === 0 && (
        <section className="card">
          <p className="empty-state">Nenhuma demanda com risco relevante agora. 🎉</p>
        </section>
      )}

      <section className="risco-lista">
        {itens.map((item) => (
          <CartaoDeRisco key={item.demandaId} item={item} aoAbrir={() => setIdAberto(item.demandaId)} />
        ))}
      </section>

      {idAberto !== null && detalhe.data && <DetalheDemandaModal demanda={detalhe.data} onFechar={() => setIdAberto(null)} />}
    </main>
  );
}
