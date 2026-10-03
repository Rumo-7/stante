import { useState } from 'react';
import { useAnexos, useEnviarAnexos, useRemoverAnexo } from '../api/anexos';
import { mensagemDeErro } from '../api/cliente';
import {
  useAtualizarDemanda,
  useFiscais,
  useValidarDemanda,
  type AlteracaoDemanda,
  type Demanda,
  type StatusDemandaEditavel,
} from '../api/demandas';
import { useUsuarioLogado } from '../auth/rotas';
import { formatarData } from '../util/data';
import { formatarTamanho } from '../util/tamanho';
import { Modal } from './Modal';
import { StatusBadge } from './StatusBadge';

const STATUS_EDITAVEIS: { valor: StatusDemandaEditavel; rotulo: string }[] = [
  { valor: 'aberta', rotulo: 'Aberta' },
  { valor: 'em_andamento', rotulo: 'Em andamento' },
  { valor: 'concluida', rotulo: 'Concluída' },
];

const TAMANHO_MAXIMO = 10 * 1024 * 1024;

export function DetalheDemandaModal({ demanda, onFechar }: { demanda: Demanda; onFechar: () => void }) {
  const usuario = useUsuarioLogado();
  const ehGestor = usuario.perfil === 'gestor';
  const somenteLeitura = usuario.perfil === 'representante';
  const emAnalise = demanda.statusSalvo === 'em_analise';

  const fiscais = useFiscais(ehGestor);
  const anexos = useAnexos(demanda.id);
  const enviarAnexos = useEnviarAnexos(demanda.id);
  const removerAnexo = useRemoverAnexo(demanda.id);
  const atualizar = useAtualizarDemanda();
  const validar = useValidarDemanda();

  const [status, setStatus] = useState<string>(demanda.statusSalvo);
  const [fiscalId, setFiscalId] = useState(demanda.fiscalId ? String(demanda.fiscalId) : '');
  const [prazo, setPrazo] = useState(demanda.prazo);
  const [novosArquivos, setNovosArquivos] = useState<File[]>([]);
  const [inputArquivos, setInputArquivos] = useState(0); // muda para limpar o <input type="file">
  const [mensagem, setMensagem] = useState<string | null>(null);

  const fiscalOriginal = demanda.fiscalId ? String(demanda.fiscalId) : '';
  const converterFiscal = (valor: string) => (valor ? Number(valor) : null);

  function salvar() {
    setMensagem(null);
    const alteracoes: AlteracaoDemanda = {};
    if (status !== demanda.statusSalvo) alteracoes.status = status as StatusDemandaEditavel;
    if (ehGestor && fiscalId !== fiscalOriginal) alteracoes.fiscalId = converterFiscal(fiscalId);

    if (Object.keys(alteracoes).length === 0) {
      onFechar();
      return;
    }
    atualizar.mutate(
      { id: demanda.id, dados: alteracoes },
      { onSuccess: onFechar, onError: (erro) => setMensagem(mensagemDeErro(erro)) },
    );
  }

  function validarDemanda() {
    setMensagem(null);
    const dados: { fiscalId?: number | null; prazo?: string } = {};
    if (fiscalId !== fiscalOriginal) dados.fiscalId = converterFiscal(fiscalId);
    if (prazo !== demanda.prazo) dados.prazo = prazo;

    validar.mutate(
      { id: demanda.id, dados },
      { onSuccess: onFechar, onError: (erro) => setMensagem(mensagemDeErro(erro)) },
    );
  }

  function enviar() {
    setMensagem(null);
    const grande = novosArquivos.find((arquivo) => arquivo.size > TAMANHO_MAXIMO);
    if (grande) {
      setMensagem(`"${grande.name}" passa de 10 MB.`);
      return;
    }
    enviarAnexos.mutate(novosArquivos, {
      onSuccess: () => {
        setNovosArquivos([]);
        setInputArquivos((n) => n + 1);
      },
      onError: (erro) => setMensagem(mensagemDeErro(erro)),
    });
  }

  const podeRemover = (enviadoPorId: number | null) =>
    ehGestor || (usuario.perfil === 'inspetor' && enviadoPorId === usuario.id);

  const seletorFiscal = (
    <select id="fiscal" value={fiscalId} onChange={(e) => setFiscalId(e.target.value)}>
      <option value="">Não atribuído</option>
      {fiscais.data?.map((fiscal) => (
        <option key={fiscal.id} value={fiscal.id}>
          {fiscal.nome}
        </option>
      ))}
    </select>
  );

  return (
    <Modal titulo={`${demanda.numero} · ${demanda.demandante}`} subtitulo={demanda.assunto} onFechar={onFechar}>
      <div className="detalhe-grid">
        <div>
          <span className="detalhe-label">Demandante</span>
          <p>{demanda.demandante}</p>
        </div>
        <div>
          <span className="detalhe-label">Prazo</span>
          <p>{formatarData(demanda.prazo)}</p>
        </div>
        <div>
          <span className="detalhe-label">Status</span>
          <p>
            <StatusBadge status={demanda.status} />
          </p>
        </div>
        <div>
          <span className="detalhe-label">Origem</span>
          <p>{demanda.origem === 'campo' ? 'Aberta em campo' : 'Planejada'}</p>
        </div>
      </div>

      {demanda.validadaEm && (
        <p className="modal-dica">Validada pelo gestor em {formatarData(demanda.validadaEm)}.</p>
      )}

      {emAnalise && (
        <div className="bloco-validacao">
          <strong>Aguardando validação</strong>
          {ehGestor ? (
            <>
              <p>
                Aberta em campo por um inspetor. Confira os dados e os anexos; ao validar, a demanda passa a
                valer como aberta. Se quiser, ajuste o fiscal e o prazo antes.
              </p>
              <div className="field-group">
                <label htmlFor="fiscal">Fiscal responsável</label>
                {seletorFiscal}
              </div>
              <div className="field-group">
                <label htmlFor="prazo">Prazo</label>
                <input type="date" id="prazo" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
              </div>
              <button type="button" className="btn-primary" onClick={validarDemanda} disabled={validar.isPending}>
                {validar.isPending ? 'Validando…' : 'Validar demanda'}
              </button>
            </>
          ) : (
            <p>Esta demanda só passa a valer depois que um gestor validar.</p>
          )}
        </div>
      )}

      {!emAnalise && !somenteLeitura && (
        <>
          <div className="field-group">
            <label htmlFor="status">Status</label>
            <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_EDITAVEIS.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </select>
          </div>

          {ehGestor && (
            <div className="field-group">
              <label htmlFor="fiscal">Fiscal responsável</label>
              {seletorFiscal}
            </div>
          )}
        </>
      )}

      {!emAnalise && somenteLeitura && (
        <div className="detalhe-grid">
          <div>
            <span className="detalhe-label">Fiscal responsável</span>
            <p>{demanda.fiscal ?? 'Não atribuído'}</p>
          </div>
        </div>
      )}

      <div className="field-group">
        <label>Anexos</label>
        <ul className="anexos-list">
          {anexos.isPending && <li className="empty-state">Carregando…</li>}
          {anexos.data?.length === 0 && <li className="empty-state">Nenhum anexo enviado.</li>}
          {anexos.data?.map((anexo) => (
            <li key={anexo.id}>
              <a href={`/api/anexos/${anexo.id}/download`} target="_blank" rel="noopener noreferrer">
                {anexo.nomeOriginal}
              </a>
              <span className="anexo-tamanho">{formatarTamanho(anexo.tamanho)}</span>
              {podeRemover(anexo.enviadoPorId) && (
                <button
                  type="button"
                  className="anexo-remover"
                  title="Remover anexo"
                  aria-label={`Remover ${anexo.nomeOriginal}`}
                  disabled={removerAnexo.isPending}
                  onClick={() =>
                    removerAnexo.mutate(anexo.id, { onError: (erro) => setMensagem(mensagemDeErro(erro)) })
                  }
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>

        {!somenteLeitura && (
          <div className="anexo-upload-row">
            <input
              key={inputArquivos}
              type="file"
              multiple
              accept=".pdf,.doc,.docx"
              onChange={(e) => setNovosArquivos(Array.from(e.target.files ?? []))}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={enviar}
              disabled={!novosArquivos.length || enviarAnexos.isPending}
            >
              {enviarAnexos.isPending ? 'Enviando…' : 'Adicionar'}
            </button>
          </div>
        )}
      </div>

      <p className={`form-message ${mensagem ? 'error' : ''}`} role="alert">
        {mensagem}
      </p>

      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onFechar}>
          Fechar
        </button>
        {!emAnalise && !somenteLeitura && (
          <button type="button" className="btn-primary" onClick={salvar} disabled={atualizar.isPending}>
            {atualizar.isPending ? 'Salvando…' : 'Salvar alterações'}
          </button>
        )}
      </div>
    </Modal>
  );
}
