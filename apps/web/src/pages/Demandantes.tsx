import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adicionarDias, hojeNoFuso } from '@stante/shared';
import { mensagemDeErro } from '../api/cliente';
import { useEstatisticasDemandantes, type EstatisticasOrgao } from '../api/demandantes';
import { GraficoTempo, orgaosParaTempo } from '../components/GraficoTempo';
import { GraficoVolumeDesfecho, MAXIMO_NO_GRAFICO } from '../components/GraficoVolumeDesfecho';
import { ModalOrgao } from '../components/ModalOrgao';
import { AMOSTRA_MINIMA, calcularDestaques } from '../util/destaques';
import { formatarDias, formatarPorcentagem } from '../util/orgaos';

type Coluna =
  | 'nome'
  | 'recebidas'
  | 'concluidas'
  | 'taxaConclusao'
  | 'pontualidade'
  | 'medianaDias'
  | 'prazoConcedidoMedianoDias'
  | 'emAberto'
  | 'vencidas';

const COLUNAS: { chave: Coluna; rotulo: string; ajuda?: string }[] = [
  { chave: 'nome', rotulo: 'Órgão' },
  { chave: 'recebidas', rotulo: 'Recebidas' },
  { chave: 'concluidas', rotulo: 'Concluídas' },
  { chave: 'taxaConclusao', rotulo: 'Conclusão', ajuda: 'Concluídas ÷ recebidas.' },
  {
    chave: 'pontualidade',
    rotulo: 'Pontualidade',
    ajuda: 'Concluídas até o fim do dia do prazo ÷ (concluídas + vencidas sem resposta).',
  },
  { chave: 'medianaDias', rotulo: 'Tempo mediano', ajuda: 'Dias entre o cadastro e a conclusão (mediana).' },
  {
    chave: 'prazoConcedidoMedianoDias',
    rotulo: 'Prazo concedido',
    ajuda: 'Quantos dias o órgão costuma dar (mediana entre o cadastro e o prazo).',
  },
  { chave: 'emAberto', rotulo: 'Em aberto' },
  { chave: 'vencidas', rotulo: 'Vencidas' },
];

function ordenar(orgaos: EstatisticasOrgao[], coluna: Coluna, decrescente: boolean): EstatisticasOrgao[] {
  const sentido = decrescente ? -1 : 1;
  return [...orgaos].sort((a, b) => {
    if (coluna === 'nome') return sentido * a.nome.localeCompare(b.nome, 'pt-BR');
    const x = a[coluna];
    const y = b[coluna];
    // Sem dado (null) vai sempre para o fim, qualquer que seja o sentido
    if (x === null && y === null) return a.nome.localeCompare(b.nome, 'pt-BR');
    if (x === null) return 1;
    if (y === null) return -1;
    return sentido * (x - y) || a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

const pequena = (quantidade: number) => quantidade < AMOSTRA_MINIMA;
const AVISO_AMOSTRA = `Menos de ${AMOSTRA_MINIMA} demandas: a taxa pode enganar.`;

export function Demandantes() {
  const hoje = hojeNoFuso();
  const PERIODOS = [
    { rotulo: 'Todo o período', de: '', ate: '' },
    { rotulo: 'Últimos 30 dias', de: adicionarDias(hoje, -29), ate: hoje },
    { rotulo: 'Últimos 90 dias', de: adicionarDias(hoje, -89), ate: hoje },
    { rotulo: 'Últimos 12 meses', de: adicionarDias(hoje, -364), ate: hoje },
  ];

  // O período fica na URL: dá para recarregar, voltar e compartilhar o link
  const [parametros, setParametros] = useSearchParams();
  const de = parametros.get('de') ?? '';
  const ate = parametros.get('ate') ?? '';

  const definirPeriodo = (novoDe: string, novoAte: string) =>
    setParametros(
      (atuais) => {
        const novos = new URLSearchParams(atuais);
        if (novoDe) novos.set('de', novoDe);
        else novos.delete('de');
        if (novoAte) novos.set('ate', novoAte);
        else novos.delete('ate');
        return novos;
      },
      { replace: true },
    );

  const estatisticas = useEstatisticasDemandantes({ de, ate });
  const [coluna, setColuna] = useState<Coluna>('recebidas');
  const [decrescente, setDecrescente] = useState(true);
  const [edicao, setEdicao] = useState<{ id: number; nome: string; tipo: string } | 'novo' | null>(null);

  const dados = estatisticas.data;
  const orgaos = useMemo(() => dados?.orgaos ?? [], [dados]);
  const linhas = useMemo(() => ordenar(orgaos, coluna, decrescente), [orgaos, coluna, decrescente]);
  const destaques = useMemo(() => calcularDestaques(orgaos, dados?.resumo.recebidas ?? 0), [orgaos, dados]);

  const orgaosNoVolume = orgaos.filter((o) => o.recebidas > 0);
  const orgaosNoTempo = orgaosParaTempo(orgaos);

  function ordenarPor(nova: Coluna) {
    if (nova === coluna) setDecrescente((atual) => !atual);
    else {
      setColuna(nova);
      setDecrescente(nova !== 'nome'); // números: do maior para o menor; nome: A a Z
    }
  }

  const periodoAtivo = PERIODOS.find((p) => p.de === de && p.ate === ate);

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Demandantes</h1>
          <p className="page-subtitle">Quem envia demandas, como elas terminam e quanto tempo levam</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setEdicao('novo')}>
          + Novo órgão
        </button>
      </header>

      <section className="card filtros-card">
        <div className="filtros-row">
          <div className="periodos" role="group" aria-label="Período de cadastro">
            {PERIODOS.map((periodo) => (
              <button
                key={periodo.rotulo}
                type="button"
                className={`periodo-btn ${periodoAtivo === periodo ? 'ativo' : ''}`}
                onClick={() => definirPeriodo(periodo.de, periodo.ate)}
              >
                {periodo.rotulo}
              </button>
            ))}
          </div>
          <div className="field-group">
            <label htmlFor="dem-de">Recebidas de</label>
            <input type="date" id="dem-de" value={de} onChange={(e) => definirPeriodo(e.target.value, ate)} />
          </div>
          <div className="field-group">
            <label htmlFor="dem-ate">até</label>
            <input type="date" id="dem-ate" value={ate} onChange={(e) => definirPeriodo(de, e.target.value)} />
          </div>
        </div>
        <p className="filtros-nota">
          Considera as demandas <strong>recebidas no período</strong>, com a situação delas <strong>hoje</strong>. Demandas
          em análise (abertas em campo, ainda não validadas) não entram.
        </p>
      </section>

      {estatisticas.isPending && <p>Carregando…</p>}
      {estatisticas.error && <p className="estado-erro">{mensagemDeErro(estatisticas.error)}</p>}

      {dados && (
        <>
          <section className="kpi-row">
            <div className="kpi-card kpi-highlight">
              <p className="kpi-label">Órgãos com demandas</p>
              <div className="kpi-value">{dados.resumo.orgaosComDemandas}</div>
              <p className="kpi-sub">de {orgaos.length} cadastrados</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Demandas recebidas</p>
              <div className="kpi-value">{dados.resumo.recebidas}</div>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Taxa de conclusão</p>
              <div className="kpi-value">{formatarPorcentagem(dados.resumo.taxaConclusao)}</div>
              <p className="kpi-sub">{dados.resumo.concluidas} concluídas</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Pontualidade</p>
              <div className="kpi-value">{formatarPorcentagem(dados.resumo.pontualidade)}</div>
              <p className="kpi-sub">dentro do prazo</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Tempo mediano</p>
              <div className="kpi-value">{formatarDias(dados.resumo.medianaDias)}</div>
              <p className="kpi-sub">para concluir</p>
            </div>
          </section>

          {destaques.length > 0 && (
            <section className="destaques" aria-label="Leituras dos números">
              {destaques.map((destaque) => (
                <div key={destaque.chave} className={`destaque destaque-${destaque.tom}`}>
                  <span className="destaque-titulo">{destaque.titulo}</span>
                  <strong>{destaque.orgao}</strong>
                  <span className="destaque-detalhe">{destaque.detalhe}</span>
                </div>
              ))}
            </section>
          )}

          {orgaosNoVolume.length === 0 ? (
            <div className="card">
              <p className="empty-state">Nenhuma demanda recebida neste período.</p>
            </div>
          ) : (
            <section className="charts-row charts-row-igual">
              <div className="card">
                <h2>Quanto cada órgão envia e como termina</h2>
                <p className="card-subtitle">
                  {orgaosNoVolume.length > MAXIMO_NO_GRAFICO
                    ? `Os ${MAXIMO_NO_GRAFICO} que mais enviam; a tabela mostra todos.`
                    : 'Cada barra é um órgão; as cores mostram a situação das demandas.'}
                </p>
                <GraficoVolumeDesfecho orgaos={orgaos} />
              </div>
              <div className="card">
                <h2>Tempo para concluir × prazo concedido</h2>
                <p className="card-subtitle">Em dias. Órgãos com pelo menos {AMOSTRA_MINIMA} demandas concluídas.</p>
                {orgaosNoTempo.length === 0 ? (
                  <p className="empty-state">
                    Ainda não há órgãos com {AMOSTRA_MINIMA} ou mais demandas concluídas neste período.
                  </p>
                ) : (
                  <GraficoTempo orgaos={orgaos} />
                )}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-header">
              <h2>Todos os órgãos</h2>
              <span className="card-subtitle">Clique no título de uma coluna para ordenar</span>
            </div>
            <div className="tabela-rolavel">
              <table className="demandas-table tabela-orgaos">
                <thead>
                  <tr>
                    {COLUNAS.map((c) => (
                      <th
                        key={c.chave}
                        title={c.ajuda}
                        aria-sort={c.chave === coluna ? (decrescente ? 'descending' : 'ascending') : 'none'}
                      >
                        <button type="button" className="ordenar" onClick={() => ordenarPor(c.chave)}>
                          {c.rotulo}
                          {c.chave === coluna && <span aria-hidden="true">{decrescente ? ' ↓' : ' ↑'}</span>}
                        </button>
                      </th>
                    ))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.nome}</strong>
                        <div className="usuario-email">{o.tipoRotulo}</div>
                      </td>
                      <td>{o.recebidas}</td>
                      <td>{o.concluidas}</td>
                      <td className={pequena(o.recebidas) ? 'amostra-pequena' : ''} title={pequena(o.recebidas) ? AVISO_AMOSTRA : undefined}>
                        {formatarPorcentagem(o.taxaConclusao)}
                      </td>
                      <td
                        className={pequena(o.noPrazo + o.foraDoPrazo + o.vencidas) ? 'amostra-pequena' : ''}
                        title={pequena(o.noPrazo + o.foraDoPrazo + o.vencidas) ? AVISO_AMOSTRA : undefined}
                      >
                        {formatarPorcentagem(o.pontualidade)}
                      </td>
                      <td className={pequena(o.concluidas) ? 'amostra-pequena' : ''} title={pequena(o.concluidas) ? AVISO_AMOSTRA : undefined}>
                        {formatarDias(o.medianaDias)}
                      </td>
                      <td>{formatarDias(o.prazoConcedidoMedianoDias)}</td>
                      <td>{o.emAberto}</td>
                      <td className={o.vencidas > 0 ? 'texto-alerta' : ''}>{o.vencidas}</td>
                      <td>
                        <button type="button" className="btn-ver" onClick={() => setEdicao({ id: o.id, nome: o.nome, tipo: o.tipo })}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {edicao && (
        <ModalOrgao orgao={edicao === 'novo' ? undefined : edicao} onFechar={() => setEdicao(null)} />
      )}
    </main>
  );
}
