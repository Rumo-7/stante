import { useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { adicionarDias, DIAS_MAXIMOS_DO_PARECER, hojeNoFuso, periodoDoParecerSchema } from '@stante/shared';
import { mensagemDeErro } from '../api/cliente';
import {
  useConfiguracaoDaIA,
  useFatosDoParecer,
  useGerarParecer,
  useListaDePareceres,
  useParecer,
  type Parecer,
} from '../api/relatorios';
import { formatarData, formatarInstante } from '../util/data';
import { formatarDias } from '../util/orgaos';

const pct = (valor: number | null) => (valor === null ? '—' : `${valor}%`);

/** O parecer técnico redigido pela Sentinela: período, números de base, minuta editável, histórico. */
export function ParecerPainel() {
  const hoje = hojeNoFuso();
  const PERIODOS = [
    { rotulo: 'Últimos 90 dias', de: adicionarDias(hoje, -89) },
    { rotulo: 'Últimos 6 meses', de: adicionarDias(hoje, -181) },
    { rotulo: 'Último ano', de: adicionarDias(hoje, -(DIAS_MAXIMOS_DO_PARECER - 2)) },
  ];

  const configuracao = useConfiguracaoDaIA();
  const [de, setDe] = useState(PERIODOS[0]!.de);
  const [ate, setAte] = useState(hoje);
  const periodoValido = useMemo(() => periodoDoParecerSchema.safeParse({ de, ate }), [de, ate]);
  const fatos = useFatosDoParecer({ de, ate }, periodoValido.success);

  const gerar = useGerarParecer();
  const lista = useListaDePareceres();
  const [idDoHistorico, setIdDoHistorico] = useState<number | null>(null);
  const doHistorico = useParecer(idDoHistorico);

  // O parecer na tela: o recém-gerado ou o aberto do histórico
  const aberto: Parecer | undefined = idDoHistorico !== null ? doHistorico.data : gerar.data;
  const [textoEditado, setTextoEditado] = useState('');
  const [editando, setEditando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    setTextoEditado(aberto?.texto ?? '');
    setEditando(false);
    setCopiado(false);
  }, [aberto]);

  const iaDisponivel = configuracao.data?.iaDisponivel ?? false;
  const semDemandas = fatos.data?.demandas.recebidas === 0;

  function pedir() {
    if (!periodoValido.success) return;
    setIdDoHistorico(null);
    gerar.mutate(periodoValido.data);
  }

  /** O navegador sugere o nome do PDF a partir do título da página: aqui ele vira o nome do parecer. */
  function imprimir() {
    if (!aberto) return;
    const tituloOriginal = document.title;
    const restaurar = () => {
      document.title = tituloOriginal;
      window.removeEventListener('afterprint', restaurar);
    };
    window.addEventListener('afterprint', restaurar);
    document.title = `Parecer de efetividade ${aberto.periodo.de} a ${aberto.periodo.ate}`;
    window.print();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoEditado);
      setCopiado(true);
    } catch {
      setCopiado(false); // sem permissão para copiar: a pessoa seleciona o texto
    }
  }

  return (
    <div className="parecer">
      {configuracao.data && !iaDisponivel && (
        <div className="card aviso-ia">
          <strong>A Sentinela ainda não está conectada à IA.</strong>
          <p>
            Para gerar pareceres, o administrador do sistema precisa colocar a chave do serviço de IA no arquivo de
            configuração do servidor e reiniciá-lo. Enquanto isso, você pode ver os números do período abaixo.
          </p>
        </div>
      )}

      <section className="card filtros-card">
        <div className="filtros-row">
          <div className="periodos" role="group" aria-label="Atalhos de período">
            {PERIODOS.map((periodo) => (
              <button
                key={periodo.rotulo}
                type="button"
                className={`periodo-btn ${de === periodo.de && ate === hoje ? 'ativo' : ''}`}
                onClick={() => {
                  setDe(periodo.de);
                  setAte(hoje);
                }}
              >
                {periodo.rotulo}
              </button>
            ))}
          </div>
          <div className="field-group">
            <label htmlFor="parecer-de">De</label>
            <input type="date" id="parecer-de" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="parecer-ate">Até</label>
            <input type="date" id="parecer-ate" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <button type="button" className="btn-primary" disabled={!periodoValido.success || !iaDisponivel || gerar.isPending || semDemandas} onClick={pedir}>
            {gerar.isPending ? 'A Sentinela está redigindo…' : 'Gerar minuta'}
          </button>
        </div>
        {!periodoValido.success && (
          <p className="form-message error">{periodoValido.error.issues[0]?.message}</p>
        )}
        {gerar.isPending && (
          <p className="filtros-nota">Isso pode levar até um minuto. Não feche esta página.</p>
        )}
        {gerar.error && (
          <p className="form-message error" role="alert">
            {mensagemDeErro(gerar.error)}
          </p>
        )}
      </section>

      {fatos.data && (
        <section className="card">
          <h2>Os números em que o parecer se baseia</h2>
          <p className="card-subtitle">
            Calculados pelo sistema para {fatos.data.periodo.rotulo}. A IA recebe <strong>só estes números</strong>: não
            vê o assunto das demandas nem nomes de pessoas.
          </p>
          {semDemandas ? (
            <p className="empty-state">Não há demandas recebidas neste período.</p>
          ) : (
            <div className="fatos-grade">
              <div><strong>{fatos.data.demandas.recebidas}</strong><span>recebidas</span></div>
              <div><strong>{fatos.data.demandas.concluidas}</strong><span>concluídas ({pct(fatos.data.demandas.taxaConclusaoPct)})</span></div>
              <div><strong>{pct(fatos.data.demandas.pontualidadePct)}</strong><span>dentro do prazo</span></div>
              <div><strong>{formatarDias(fatos.data.demandas.tempoMedianoParaConcluirDias)}</strong><span>tempo mediano</span></div>
              <div><strong>{fatos.data.demandas.vencidas}</strong><span>vencidas hoje</span></div>
              <div><strong>{fatos.data.demandas.reaberturas}</strong><span>reabertas</span></div>
            </div>
          )}
          <details className="como-decide">
            <summary>O que este parecer não consegue dizer</summary>
            <ul>
              {fatos.data.naoDisponivelNoSistema.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="card-subtitle">O sistema não registra isto; a minuta avisa que esses dados não estão disponíveis.</p>
          </details>
        </section>
      )}

      {aberto && (
        <section className="card parecer-documento">
          <div className="card-header">
            <div>
              <h2>Minuta do parecer</h2>
              <p className="card-subtitle">
                {formatarData(aberto.periodo.de)} a {formatarData(aberto.periodo.ate)} · gerada em{' '}
                {formatarInstante(aberto.criadoEm)}
                {aberto.geradoPor ? ` por ${aberto.geradoPor}` : ''} · modelo {aberto.modelo}
              </p>
            </div>
            <div className="parecer-acoes">
              <button type="button" className="btn-secondary" onClick={() => setEditando((v) => !v)}>
                {editando ? 'Ver formatado' : 'Editar texto'}
              </button>
              <button type="button" className="btn-secondary" onClick={copiar}>
                {copiado ? 'Copiado!' : 'Copiar'}
              </button>
              <button type="button" className="btn-secondary" onClick={imprimir}>
                Imprimir / salvar PDF
              </button>
            </div>
          </div>

          {aberto.numerosParaConferir.length > 0 && (
            <div className="aviso-conferencia" role="alert">
              <strong>Confira estes números no texto:</strong> {aberto.numerosParaConferir.join(', ')}.
              <span> Eles não constam nos dados que a IA recebeu, então podem ter sido inventados ou mal copiados.</span>
            </div>
          )}

          {editando ? (
            <textarea
              className="parecer-editor"
              value={textoEditado}
              onChange={(e) => setTextoEditado(e.target.value)}
              aria-label="Texto do parecer"
              rows={24}
            />
          ) : (
            <article className="parecer-texto">
              {/* O cabeçalho é montado pelo sistema, com dados conhecidos: não depende do que a IA escrever */}
              <header className="parecer-cabecalho">
                <p className="parecer-unidade">{aberto.fatos.unidade}</p>
                <h1>Parecer técnico de efetividade</h1>
                <p>
                  Período analisado: {formatarData(aberto.periodo.de)} a {formatarData(aberto.periodo.ate)}
                </p>
                <p className="parecer-selo">Minuta gerada por IA, sujeita à revisão e validação do gestor</p>
              </header>
              {/* O texto vem de uma IA: nenhum HTML dele é interpretado, só o Markdown (com tabelas) */}
              <Markdown remarkPlugins={[remarkGfm]}>{textoEditado}</Markdown>
            </article>
          )}
          <p className="filtros-nota">
            Edições feitas aqui não são salvas no sistema: copie ou imprima depois de revisar. A minuta original fica
            guardada no histórico. <strong>Para um PDF limpo</strong>, na janela de impressão abra "Mais configurações" e
            desmarque <strong>"Cabeçalhos e rodapés"</strong> (o navegador guarda a escolha).
          </p>
        </section>
      )}

      {doHistorico.error && <p className="estado-erro">{mensagemDeErro(doHistorico.error)}</p>}

      <section className="card">
        <h2>Pareceres já gerados</h2>
        {lista.data?.length === 0 && <p className="empty-state">Nenhum parecer gerado ainda.</p>}
        <ul className="historico-pareceres">
          {lista.data?.map((item) => (
            <li key={item.id}>
              <button type="button" className="btn-ver" onClick={() => setIdDoHistorico(item.id)}>
                Abrir
              </button>
              <span>
                {formatarData(item.periodo.de)} a {formatarData(item.periodo.ate)}
              </span>
              <span className="usuario-email">
                {formatarInstante(item.criadoEm)} · {item.geradoPor ?? 'usuário removido'}
                {item.numerosParaConferir.length > 0 ? ` · ${item.numerosParaConferir.length} número(s) a conferir` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

