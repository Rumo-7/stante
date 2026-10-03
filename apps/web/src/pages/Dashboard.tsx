import { useState } from 'react';
import { Link } from 'react-router-dom';
import { mensagemDeErro } from '../api/cliente';
import { useDashboard, type DadosDashboard } from '../api/dashboard';
import { useDemandas } from '../api/demandas';
import { useUsuarioLogado } from '../auth/rotas';
import { GraficoTendencia } from '../components/GraficoTendencia';
import { NovaDemandaModal } from '../components/NovaDemandaModal';
import { StatusBadge } from '../components/StatusBadge';
import { formatarData } from '../util/data';

const CORES_BARRAS = ['#CC8712', '#142721', '#E0A526', '#315f28', '#8f9c96'];

function ListaBarras({ itens }: { itens: { rotulo: string; valor: number }[] }) {
  if (!itens.length) return <p className="empty-state">Nenhum dado ainda.</p>;

  const maximo = Math.max(...itens.map((item) => item.valor));
  return (
    <div className="bar-list">
      {itens.map((item, indice) => (
        <div className="bar-list-item" key={item.rotulo}>
          <div className="bar-label-row">
            <span>{item.rotulo}</span>
            <span>{item.valor}</span>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{
                width: `${maximo ? Math.max((item.valor / maximo) * 100, 6) : 0}%`,
                background: CORES_BARRAS[indice % CORES_BARRAS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListaPrazos({ prazos }: { prazos: DadosDashboard['prazosProximos'] }) {
  if (!prazos.length) return <p className="empty-state">Nenhum prazo nos próximos 30 dias.</p>;

  return (
    <div className="prazos-list">
      {prazos.map((prazo, indice) => (
        <div className={`prazo-item ${indice === 0 && prazo.dias <= 5 ? 'urgente' : ''}`} key={prazo.numero}>
          <div className="prazo-info">
            <strong>
              {prazo.numero} · {prazo.demandante}
            </strong>
            <span>{prazo.assunto}</span>
          </div>
          <span className="prazo-dias-badge">{prazo.dias}d</span>
        </div>
      ))}
    </div>
  );
}

export function Dashboard() {
  const usuario = useUsuarioLogado();
  const dashboard = useDashboard();
  const recentes = useDemandas({ ordenar: 'recentes', limite: 5 });
  const [modalAberto, setModalAberto] = useState(false);

  const ehGestor = usuario.perfil === 'gestor';
  const podeCriar = usuario.perfil !== 'representante';
  const dados = dashboard.data;
  const precisaAtencao = dados && (dados.vencidas > 0 || dados.prazoCritico > 0);

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Visão Geral</h1>
          <p className="page-subtitle">VISAT/CEREST Recife</p>
        </div>
        {podeCriar && (
          <button type="button" className="btn-primary" onClick={() => setModalAberto(true)}>
            + Nova Demanda
          </button>
        )}
      </header>

      {dashboard.isPending && <p>Carregando indicadores…</p>}
      {dashboard.error && <p className="estado-erro">{mensagemDeErro(dashboard.error)}</p>}

      {dados && (
        <>
          {precisaAtencao && (
            <div className="alert-banner" role="alert">
              <span>
                ⚠ <strong>Atenção:</strong> {dados.vencidas} demanda(s) com prazo vencido e {dados.prazoCritico} com
                prazo crítico (≤ 5 dias). Verifique imediatamente.
              </span>
              <Link to="/prazos" className="alert-link">
                Ver prazos →
              </Link>
            </div>
          )}

          <section className={`kpi-row ${podeCriar ? 'kpi-row-6' : ''}`}>
            <div className="kpi-card kpi-highlight">
              <p className="kpi-label">Total Demandas</p>
              <div className="kpi-value">{dados.total}</div>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Em Andamento</p>
              <div className="kpi-value">{dados.emAndamento}</div>
              <p className="kpi-sub">{dados.atribuidas} atribuídas</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Prazo Crítico</p>
              <div className="kpi-value">{dados.prazoCritico}</div>
              <p className="kpi-sub">≤ 5 dias</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Vencidas</p>
              <div className="kpi-value">{dados.vencidas}</div>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Concluídas</p>
              <div className="kpi-value">{dados.concluidas}</div>
            </div>
            {podeCriar && (
              <div className={`kpi-card ${dados.aguardandoValidacao > 0 ? 'kpi-atencao' : ''}`}>
                <p className="kpi-label">{ehGestor ? 'Aguardando validação' : 'Em análise'}</p>
                <div className="kpi-value">{dados.aguardandoValidacao}</div>
                {ehGestor && dados.aguardandoValidacao > 0 ? (
                  <Link className="link" to="/demandas?status=em_analise">
                    Revisar →
                  </Link>
                ) : (
                  <p className="kpi-sub">abertas em campo</p>
                )}
              </div>
            )}
          </section>

          <section className="charts-row">
            <div className="card chart-card">
              <h2>Tendência Mensal</h2>
              <p className="card-subtitle">Recebidas vs. Concluídas</p>
              <GraficoTendencia dados={dados.tendenciaMensal} />
            </div>
            <div className="card">
              <h2>Demandas por Demandante</h2>
              <p className="card-subtitle">Em aberto</p>
              <ListaBarras itens={dados.porDemandante.map((d) => ({ rotulo: d.tipo, valor: d.quantidade }))} />
            </div>
          </section>

          <section className="bottom-row">
            <div className="card">
              <div className="card-header">
                <h2>Demandas Recentes</h2>
                <Link to="/demandas" className="link">
                  Ver todas →
                </Link>
              </div>
              <p className="card-subtitle">Últimas cadastradas</p>
              <table className="demandas-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Demandante</th>
                    <th>Assunto</th>
                    <th>Fiscal</th>
                    <th>Prazo</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentes.data?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty-state">
                        Nenhuma demanda cadastrada ainda.
                      </td>
                    </tr>
                  )}
                  {recentes.data?.map((demanda) => (
                    <tr key={demanda.id}>
                      <td>{demanda.numero}</td>
                      <td>{demanda.demandante}</td>
                      <td>{demanda.assunto}</td>
                      <td>{demanda.fiscal ?? '—'}</td>
                      <td>{formatarData(demanda.prazo)}</td>
                      <td>
                        <StatusBadge status={demanda.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {recentes.error && <p className="estado-erro">{mensagemDeErro(recentes.error)}</p>}
            </div>

            <div className="side-cards">
              <div className="card">
                <h2>Prazos Próximos</h2>
                <p className="card-subtitle">Próximos 30 dias</p>
                <ListaPrazos prazos={dados.prazosProximos} />
              </div>
              {ehGestor && (
                <div className="card">
                  <h2>Carga dos Fiscais</h2>
                  <p className="card-subtitle">Demandas ativas por fiscal</p>
                  <ListaBarras itens={dados.cargaFiscais.map((c) => ({ rotulo: c.fiscal, valor: c.quantidade }))} />
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {modalAberto && <NovaDemandaModal onFechar={() => setModalAberto(false)} />}
    </main>
  );
}
