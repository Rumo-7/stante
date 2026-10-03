import { useMemo, useState } from 'react';
import { adicionarDias, diasParaPrazo, hojeNoFuso } from '@stante/shared';
import { mensagemDeErro } from '../api/cliente';
import { useDemandas, type Demanda } from '../api/demandas';
import { useFiscais } from '../api/fiscais';
import { useUsuarioLogado } from '../auth/rotas';
import { mapaDoRadar, useRadar, type ItemDoRadar } from '../api/radar';
import { CalendarioPrazos } from '../components/CalendarioPrazos';
import { DetalheDemandaModal } from '../components/DetalheDemandaModal';
import { RadarSelo } from '../components/RadarSelo';
import { formatarData } from '../util/data';

const DIAS_PROXIMOS = 30;
const doisDigitos = (n: number) => String(n).padStart(2, '0');

function LinhaPrazo({
  demanda,
  hoje,
  risco,
  aoAbrir,
}: {
  demanda: Demanda;
  hoje: string;
  risco: ItemDoRadar | undefined;
  aoAbrir: () => void;
}) {
  const dias = diasParaPrazo(demanda.prazo, hoje);
  const borda = demanda.status === 'vencida' ? 'borda-vencida' : demanda.status === 'prazo_critico' ? 'borda-critico' : '';

  return (
    <div className={`prazo-row ${borda}`}>
      <div className="prazo-row-info">
        <strong>
          {demanda.numero} · {demanda.demandante}
        </strong>
        <span>
          {demanda.assunto} — {demanda.fiscal ?? 'Sem fiscal atribuído'}
        </span>
      </div>
      <div className="prazo-row-meta">
        <span>{formatarData(demanda.prazo)}</span>
        <RadarSelo item={risco} />
        <span className="prazo-row-dias">{dias < 0 ? `${Math.abs(dias)}d em atraso` : `${dias}d restantes`}</span>
        <button type="button" className="btn-ver" onClick={aoAbrir}>
          Ver demanda
        </button>
      </div>
    </div>
  );
}

function Secao({
  titulo,
  classeTitulo,
  vazio,
  demandas,
  hoje,
  riscos,
  aoAbrir,
}: {
  titulo: string;
  classeTitulo?: string;
  vazio: string;
  demandas: Demanda[];
  hoje: string;
  riscos: Map<number, ItemDoRadar>;
  aoAbrir: (id: number) => void;
}) {
  return (
    <div className="prazo-secao">
      <h2 className={`prazo-secao-titulo ${classeTitulo ?? ''}`}>
        {titulo} <span className="contagem">{demandas.length}</span>
      </h2>
      <div className="prazo-secao-lista">
        {demandas.length === 0 && <p className="empty-state">{vazio}</p>}
        {demandas.map((demanda) => (
          <LinhaPrazo key={demanda.id} demanda={demanda} hoje={hoje} risco={riscos.get(demanda.id)} aoAbrir={() => aoAbrir(demanda.id)} />
        ))}
      </div>
    </div>
  );
}

export function Prazos() {
  const usuario = useUsuarioLogado();
  const ehGestor = usuario.perfil === 'gestor';
  const hoje = hojeNoFuso();

  const [visao, setVisao] = useState<'lista' | 'calendario'>('lista');
  const [fiscalId, setFiscalId] = useState('');
  const [{ ano, mes }, setMesAtual] = useState(() => {
    const [a, m] = hoje.split('-').map(Number) as [number, number];
    return { ano: a, mes: m - 1 };
  });
  const [idAberto, setIdAberto] = useState<number | null>(null);

  const fiscais = useFiscais(ehGestor);
  const radar = useRadar(usuario.perfil !== 'representante');
  const riscos = useMemo(() => mapaDoRadar(radar.data), [radar.data]);

  // Cada visão pede ao servidor só o que mostra
  const lista = useDemandas(
    { ativas: true, ate: adicionarDias(hoje, DIAS_PROXIMOS), fiscalId },
    visao === 'lista',
  );
  const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const calendario = useDemandas(
    {
      ativas: true,
      de: `${ano}-${doisDigitos(mes + 1)}-01`,
      ate: `${ano}-${doisDigitos(mes + 1)}-${doisDigitos(ultimoDiaDoMes)}`,
      fiscalId,
    },
    visao === 'calendario',
  );

  const consulta = visao === 'lista' ? lista : calendario;
  const demandas = consulta.data ?? [];
  const demandaAberta = demandas.find((demanda) => demanda.id === idAberto) ?? null;

  const vencidas = demandas.filter((d) => d.status === 'vencida');
  const criticas = demandas.filter((d) => d.status === 'prazo_critico');
  const proximas = demandas.filter((d) => d.status !== 'vencida' && d.status !== 'prazo_critico');

  function mudarMes(deslocamento: -1 | 1) {
    setMesAtual(({ ano: a, mes: m }) => {
      const novoMes = m + deslocamento;
      if (novoMes < 0) return { ano: a - 1, mes: 11 };
      if (novoMes > 11) return { ano: a + 1, mes: 0 };
      return { ano: a, mes: novoMes };
    });
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Prazos</h1>
          <p className="page-subtitle">Vencidos, críticos e próximos prazos legais</p>
        </div>
      </header>

      <section className="card filtros-card">
        <div className="filtros-row">
          {ehGestor && (
            <div className="field-group">
              <label htmlFor="filtro-fiscal">Fiscal</label>
              <select id="filtro-fiscal" value={fiscalId} onChange={(e) => setFiscalId(e.target.value)}>
                <option value="">Todos os fiscais</option>
                {fiscais.data?.map((fiscal) => (
                  <option key={fiscal.id} value={fiscal.id}>
                    {fiscal.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="view-toggle">
            <button
              type="button"
              className={`toggle-btn ${visao === 'lista' ? 'active' : ''}`}
              onClick={() => setVisao('lista')}
            >
              Lista
            </button>
            <button
              type="button"
              className={`toggle-btn ${visao === 'calendario' ? 'active' : ''}`}
              onClick={() => setVisao('calendario')}
            >
              Calendário
            </button>
          </div>
        </div>
      </section>

      {consulta.error && <p className="estado-erro">{mensagemDeErro(consulta.error)}</p>}
      {consulta.isPending && <p>Carregando prazos…</p>}

      {consulta.data && visao === 'lista' && (
        <section>
          <Secao
            titulo="Vencidas"
            classeTitulo="titulo-vencida"
            vazio="Nenhuma demanda vencida. 🎉"
            demandas={vencidas}
            hoje={hoje}
            riscos={riscos}
            aoAbrir={setIdAberto}
          />
          <Secao
            titulo="Prazo Crítico · até 5 dias"
            classeTitulo="titulo-critico"
            vazio="Nenhuma demanda com prazo crítico."
            demandas={criticas}
            hoje={hoje}
            riscos={riscos}
            aoAbrir={setIdAberto}
          />
          <Secao
            titulo="Próximos 30 dias"
            vazio="Nenhum prazo nos próximos 30 dias."
            demandas={proximas}
            hoje={hoje}
            riscos={riscos}
            aoAbrir={setIdAberto}
          />
        </section>
      )}

      {visao === 'calendario' && (
        <CalendarioPrazos ano={ano} mes={mes} demandas={demandas} aoMudarMes={mudarMes} aoAbrir={setIdAberto} />
      )}

      {demandaAberta && <DetalheDemandaModal demanda={demandaAberta} onFechar={() => setIdAberto(null)} />}
    </main>
  );
}
