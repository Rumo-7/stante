import { useState, type FormEvent } from 'react';
import { DIAS_PRAZO_PADRAO } from '@stante/shared';
import { mensagemDeErro } from '../api/cliente';
import {
  baixarModeloCsv,
  useImportarDemandas,
  usePreviaImportacao,
  type ResultadoImportacao,
} from '../api/importacao';
import { formatarData } from '../util/data';
import { Modal } from './Modal';

/**
 * Importação de demandas a partir da planilha (CSV) que a VISAT já usa para controlar o SEI.
 * Dois passos: a prévia mostra o que entra e o que tem erro; só ao confirmar algo é gravado.
 */
export function ImportarCsvModal({ onFechar }: { onFechar: () => void }) {
  const previa = usePreviaImportacao();
  const importar = useImportarDemandas();

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const importado = resultado?.criadas !== undefined;
  const ocupado = previa.isPending || importar.isPending;

  function escolherArquivo(novo: File | null) {
    // Arquivo novo invalida a prévia anterior
    setArquivo(novo);
    setResultado(null);
    setMensagem(null);
  }

  async function gerarPrevia(evento: FormEvent) {
    evento.preventDefault();
    if (!arquivo) {
      setMensagem('Selecione o arquivo CSV.');
      return;
    }
    setMensagem(null);
    try {
      setResultado(await previa.mutateAsync(arquivo));
    } catch (erro) {
      setMensagem(mensagemDeErro(erro));
    }
  }

  async function confirmar() {
    if (!arquivo) return;
    setMensagem(null);
    try {
      setResultado(await importar.mutateAsync(arquivo));
    } catch (erro) {
      setMensagem(mensagemDeErro(erro));
    }
  }

  return (
    <Modal
      titulo="Importar demandas (CSV)"
      subtitulo="Envie a planilha de controle do SEI salva como CSV. Você confere a prévia antes de importar."
      largo
      onFechar={onFechar}
    >
      {!importado && (
        <form onSubmit={gerarPrevia} noValidate>
          <div className="field-group">
            <label htmlFor="arquivo-csv">Arquivo CSV</label>
            <input
              type="file"
              id="arquivo-csv"
              accept=".csv,text/csv"
              onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
            />
            <small className="campo-dica">
              Colunas obrigatórias: <strong>Órgão demandante</strong> e <strong>Assunto</strong>. Também são lidas:
              Processo SEI, Data de recebimento, Prazo, Responsável, Situação, Tipo e Nº do documento e Observações.
              Sem prazo, vale {DIAS_PRAZO_PADRAO} dias a partir do recebimento.{' '}
              <button type="button" className="link-botao" onClick={baixarModeloCsv}>
                Baixar modelo
              </button>
            </small>
          </div>

          {!resultado && (
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onFechar}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={ocupado}>
                {previa.isPending ? 'Analisando…' : 'Gerar prévia'}
              </button>
            </div>
          )}
        </form>
      )}

      {resultado && (
        <>
          <div className={`importacao-resumo ${importado ? 'sucesso' : ''}`}>
            {importado ? (
              <strong>
                {resultado.criadas} {resultado.criadas === 1 ? 'demanda importada' : 'demandas importadas'}.
              </strong>
            ) : (
              <strong>
                {resultado.totais.validas} {resultado.totais.validas === 1 ? 'linha pronta' : 'linhas prontas'} para
                importar
              </strong>
            )}
            {resultado.totais.comErro > 0 && (
              <span>
                {' '}
                · {resultado.totais.comErro} com erro {importado ? '(não importadas)' : '(ficarão de fora)'}
              </span>
            )}
            {resultado.colunas.ignoradas.length > 0 && (
              <p className="campo-dica">Colunas ignoradas: {resultado.colunas.ignoradas.join(', ')}.</p>
            )}
          </div>

          <div className="importacao-tabela">
            <table className="demandas-table">
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Situação</th>
                  <th>Processo SEI</th>
                  <th>Órgão</th>
                  <th>Assunto</th>
                  <th>Prazo</th>
                  <th>Fiscal</th>
                </tr>
              </thead>
              <tbody>
                {resultado.linhas.map((linha) => {
                  const ok = linha.erros.length === 0;
                  return (
                    <tr key={linha.linha} className={ok ? '' : 'linha-com-erro'}>
                      <td>{linha.linha}</td>
                      <td>
                        <span className={`badge ${ok ? 'badge-green' : 'badge-red'}`}>
                          {ok ? (importado ? 'Importada' : 'OK') : 'Erro'}
                        </span>
                      </td>
                      <td>{linha.processoSei ?? '—'}</td>
                      <td>{linha.demandante || '—'}</td>
                      <td>
                        {linha.assunto || '—'}
                        {!ok && (
                          <ul className="importacao-erros">
                            {linha.erros.map((erro) => (
                              <li key={erro}>{erro}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>{linha.prazo ? formatarData(linha.prazo) : '—'}</td>
                      <td>{linha.fiscal ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className={`form-message ${mensagem ? 'error' : ''}`} role="alert">
        {mensagem}
      </p>

      {resultado && (
        <div className="modal-actions">
          {importado ? (
            <button type="button" className="btn-primary" onClick={onFechar}>
              Fechar
            </button>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={onFechar}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={confirmar}
                disabled={ocupado || resultado.totais.validas === 0}
              >
                {importar.isPending
                  ? 'Importando…'
                  : `Importar ${resultado.totais.validas} ${resultado.totais.validas === 1 ? 'demanda' : 'demandas'}`}
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
