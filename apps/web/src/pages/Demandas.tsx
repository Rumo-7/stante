import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, mensagemDeErro } from '../api/cliente';
import { useDemandas, type Demanda } from '../api/demandas';
import { useQueryClient } from '@tanstack/react-query';
import { useUsuarioLogado } from '../auth/rotas';
import { DetalheDemandaModal } from '../components/DetalheDemandaModal';
import { NovaDemandaModal } from '../components/NovaDemandaModal';
import { StatusBadge } from '../components/StatusBadge';
import { formatarData } from '../util/data';

const FILTROS_DE_STATUS = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'em_analise', rotulo: 'Em análise' },
  { valor: 'aberta', rotulo: 'Aberta' },
  { valor: 'em_andamento', rotulo: 'Em andamento' },
  { valor: 'prazo_critico', rotulo: 'Prazo crítico' },
  { valor: 'vencida', rotulo: 'Vencida' },
  { valor: 'concluida', rotulo: 'Concluída' },
];

/** Demandas que dá para marcar como concluídas em lote: nem em análise, nem já concluídas. */
const podeSelecionar = (demanda: Demanda) =>
  demanda.statusSalvo !== 'em_analise' && demanda.statusSalvo !== 'concluida';

export function Demandas() {
  const usuario = useUsuarioLogado();
  const clienteQuery = useQueryClient();
  const podeEditar = usuario.perfil !== 'representante';

  // Os filtros ficam na URL: dá para recarregar, voltar e compartilhar o link
  const [parametros, setParametros] = useSearchParams();
  const filtros = useMemo(
    () => ({
      de: parametros.get('de') ?? '',
      ate: parametros.get('ate') ?? '',
      status: parametros.get('status') ?? '',
      busca: parametros.get('busca') ?? '',
    }),
    [parametros],
  );

  const definirFiltro = (nome: keyof typeof filtros, valor: string) =>
    setParametros(
      (atuais) => {
        const novos = new URLSearchParams(atuais);
        if (valor) novos.set(nome, valor);
        else novos.delete(nome);
        return novos;
      },
      { replace: true },
    );

  // A busca por texto espera o usuário parar de digitar antes de consultar
  const [textoBusca, setTextoBusca] = useState(filtros.busca);
  useEffect(() => {
    const espera = setTimeout(() => definirFiltro('busca', textoBusca.trim()), 300);
    return () => clearTimeout(espera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoBusca]);

  const demandas = useDemandas(filtros);
  const lista = demandas.data ?? [];

  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [mensagemLote, setMensagemLote] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState(false);
  const [idAberto, setIdAberto] = useState<number | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);

  // Vindo de um aviso do sino (/demandas?abrir=ID): abre a demanda e limpa o parâmetro da URL
  const abrirParametro = parametros.get('abrir');
  useEffect(() => {
    if (!abrirParametro || !demandas.data) return;
    const id = Number(abrirParametro);
    if (demandas.data.some((demanda) => demanda.id === id)) setIdAberto(id);
    setParametros(
      (atuais) => {
        const novos = new URLSearchParams(atuais);
        novos.delete('abrir');
        return novos;
      },
      { replace: true },
    );
  }, [abrirParametro, demandas.data, setParametros]);

  // Mudou o filtro: a seleção anterior não vale mais
  const chaveFiltros = JSON.stringify(filtros);
  useEffect(() => setSelecionadas(new Set()), [chaveFiltros]);

  const selecionaveis = lista.filter(podeSelecionar);
  const todasMarcadas = selecionaveis.length > 0 && selecionaveis.every((d) => selecionadas.has(d.id));
  const demandaAberta = lista.find((demanda) => demanda.id === idAberto) ?? null;

  function alternar(id: number) {
    setSelecionadas((atuais) => {
      const novas = new Set(atuais);
      if (novas.has(id)) novas.delete(id);
      else novas.add(id);
      return novas;
    });
  }

  async function concluirSelecionadas() {
    setMensagemLote(null);
    setConcluindo(true);
    const ids = [...selecionadas];
    const resultados = await Promise.allSettled(
      ids.map((id) => api.patch(`/demandas/${id}`, { status: 'concluida' })),
    );
    setConcluindo(false);

    const falhas = resultados.filter((r) => r.status === 'rejected');
    if (falhas.length > 0) {
      const motivo = mensagemDeErro((falhas[0] as PromiseRejectedResult).reason);
      setMensagemLote(`${falhas.length} de ${ids.length} não puderam ser concluídas. ${motivo}`);
    }
    setSelecionadas(new Set());
    await Promise.all([
      clienteQuery.invalidateQueries({ queryKey: ['demandas'] }),
      clienteQuery.invalidateQueries({ queryKey: ['dashboard'] }),
      clienteQuery.invalidateQueries({ queryKey: ['fiscais'] }),
    ]);
  }

  function limparFiltros() {
    setTextoBusca('');
    setParametros({}, { replace: true });
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Demandas</h1>
          <p className="page-subtitle">
            {usuario.perfil === 'gestor'
              ? 'Todas as demandas da VISAT/CEREST Recife'
              : usuario.perfil === 'inspetor'
                ? 'Suas demandas'
                : 'Demandas do seu órgão'}
          </p>
        </div>
        {podeEditar && (
          <button type="button" className="btn-primary" onClick={() => setNovaAberta(true)}>
            + Nova Demanda
          </button>
        )}
      </header>

      <section className="card filtros-card">
        <div className="filtros-row">
          <div className="field-group">
            <label htmlFor="filtro-de">Prazo de</label>
            <input type="date" id="filtro-de" value={filtros.de} onChange={(e) => definirFiltro('de', e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="filtro-ate">Prazo até</label>
            <input type="date" id="filtro-ate" value={filtros.ate} onChange={(e) => definirFiltro('ate', e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="filtro-status">Status</label>
            <select id="filtro-status" value={filtros.status} onChange={(e) => definirFiltro('status', e.target.value)}>
              {FILTROS_DE_STATUS.filter((o) => usuario.perfil !== 'representante' || o.valor !== 'em_analise').map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group busca-group">
            <label htmlFor="filtro-busca">Buscar</label>
            <input
              type="text"
              id="filtro-busca"
              placeholder="ID, assunto, demandante ou fiscal"
              value={textoBusca}
              onChange={(e) => setTextoBusca(e.target.value)}
            />
          </div>
          <button type="button" className="btn-secondary" onClick={limparFiltros}>
            Limpar filtros
          </button>
        </div>
      </section>

      {selecionadas.size > 0 && (
        <div className="bulk-bar">
          <span>{selecionadas.size} selecionada(s)</span>
          <button type="button" className="btn-primary" onClick={concluirSelecionadas} disabled={concluindo}>
            {concluindo ? 'Concluindo…' : 'Marcar como concluída'}
          </button>
        </div>
      )}

      {mensagemLote && (
        <p className="form-message error" role="alert">
          {mensagemLote}
        </p>
      )}

      <section className="card">
        <div className="card-header">
          <h2>{usuario.perfil === 'gestor' ? 'Todas as Demandas' : 'Demandas'}</h2>
          <span className="card-subtitle">
            {demandas.data ? `${lista.length} demanda(s) encontrada(s)` : ''}
          </span>
        </div>

        <table className="demandas-table">
          <thead>
            <tr>
              {podeEditar && (
                <th className="col-checkbox">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todas"
                    checked={todasMarcadas}
                    disabled={selecionaveis.length === 0}
                    onChange={() =>
                      setSelecionadas(todasMarcadas ? new Set() : new Set(selecionaveis.map((d) => d.id)))
                    }
                  />
                </th>
              )}
              <th>ID</th>
              <th>Demandante</th>
              <th>Assunto</th>
              <th>Fiscal</th>
              <th>Prazo</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {demandas.isPending && (
              <tr>
                <td colSpan={8} className="empty-state">
                  Carregando…
                </td>
              </tr>
            )}
            {demandas.error && (
              <tr>
                <td colSpan={8} className="estado-erro">
                  {mensagemDeErro(demandas.error)}
                </td>
              </tr>
            )}
            {demandas.data && lista.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-state">
                  Nenhuma demanda encontrada com esses filtros.
                </td>
              </tr>
            )}
            {lista.map((demanda) => (
              <tr key={demanda.id}>
                {podeEditar && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${demanda.numero}`}
                      checked={selecionadas.has(demanda.id)}
                      disabled={!podeSelecionar(demanda)}
                      onChange={() => alternar(demanda.id)}
                    />
                  </td>
                )}
                <td>
                  {demanda.numero}
                  {demanda.origem === 'campo' && <span className="tag-campo">campo</span>}
                </td>
                <td>{demanda.demandante}</td>
                <td>{demanda.assunto}</td>
                <td>{demanda.fiscal ?? '—'}</td>
                <td>{formatarData(demanda.prazo)}</td>
                <td>
                  <StatusBadge status={demanda.status} />
                </td>
                <td>
                  <button type="button" className="btn-ver" onClick={() => setIdAberto(demanda.id)}>
                    Ver demanda
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {demandaAberta && <DetalheDemandaModal demanda={demandaAberta} onFechar={() => setIdAberto(null)} />}
      {novaAberta && <NovaDemandaModal onFechar={() => setNovaAberta(false)} />}
    </main>
  );
}
