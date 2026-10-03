import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { criarDemandaSchema } from '@stante/shared';
import { criarDemandante, useCriarDemanda, useDemandantes, useFiscais } from '../api/demandas';
import { mensagemDeErro } from '../api/cliente';
import { useUsuarioLogado } from '../auth/rotas';
import { Modal } from './Modal';

const TAMANHO_MAXIMO = 10 * 1024 * 1024;
const CAMPOS_VAZIOS = { demandanteId: '', outroNome: '', assunto: '', fiscalId: '', prazo: '' };

/** Formulário de nova demanda, usado no dashboard e na tela de demandas. */
export function NovaDemandaModal({ onFechar }: { onFechar: () => void }) {
  const usuario = useUsuarioLogado();
  const ehGestor = usuario.perfil === 'gestor';
  const clienteQuery = useQueryClient();

  const demandantes = useDemandantes();
  const fiscais = useFiscais(ehGestor);
  const criarDemanda = useCriarDemanda();

  const [campos, setCampos] = useState(CAMPOS_VAZIOS);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const alterar = (campo: keyof typeof CAMPOS_VAZIOS) => (e: { target: { value: string } }) =>
    setCampos((atual) => ({ ...atual, [campo]: e.target.value }));

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);

    const outroOrgao = campos.demandanteId === 'outro';
    if (outroOrgao && !campos.outroNome.trim()) {
      setMensagem('Digite o nome do órgão.');
      return;
    }

    // Valida tudo antes de cadastrar um órgão novo, para não deixar órgão solto se o resto falhar
    const previa = criarDemandaSchema.safeParse({
      demandanteId: outroOrgao ? 1 : campos.demandanteId,
      assunto: campos.assunto,
      fiscalId: campos.fiscalId,
      prazo: campos.prazo,
    });
    if (!previa.success) {
      setMensagem(previa.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }

    const grande = arquivos.find((arquivo) => arquivo.size > TAMANHO_MAXIMO);
    if (grande) {
      setMensagem(`"${grande.name}" passa de 10 MB.`);
      return;
    }

    setEnviando(true);
    try {
      let demandanteId = campos.demandanteId;
      if (outroOrgao) {
        const novo = await criarDemandante(campos.outroNome.trim());
        demandanteId = String(novo.id);
        await clienteQuery.invalidateQueries({ queryKey: ['demandantes'] });
      }

      const formulario = new FormData();
      formulario.append('demandanteId', demandanteId);
      formulario.append('assunto', campos.assunto.trim());
      if (ehGestor && campos.fiscalId) formulario.append('fiscalId', campos.fiscalId);
      formulario.append('prazo', campos.prazo);
      arquivos.forEach((arquivo) => formulario.append('anexos', arquivo));

      await criarDemanda.mutateAsync(formulario);
      onFechar();
    } catch (erro) {
      setMensagem(mensagemDeErro(erro));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Nova Demanda" onFechar={onFechar}>
      <form onSubmit={aoEnviar} noValidate>
          <div className="field-group">
            <label htmlFor="demandante">Demandante</label>
            <select id="demandante" value={campos.demandanteId} onChange={alterar('demandanteId')} required>
              <option value="" disabled>
                {demandantes.isPending ? 'Carregando…' : 'Selecione o órgão'}
              </option>
              {demandantes.data?.map((demandante) => (
                <option key={demandante.id} value={demandante.id}>
                  {demandante.nome}
                </option>
              ))}
              <option value="outro">Outro</option>
            </select>
          </div>

          {campos.demandanteId === 'outro' && (
            <div className="field-group">
              <label htmlFor="outro-orgao">Qual órgão?</label>
              <input
                type="text"
                id="outro-orgao"
                placeholder="Digite o nome do órgão"
                value={campos.outroNome}
                onChange={alterar('outroNome')}
              />
            </div>
          )}

          <div className="field-group">
            <label htmlFor="assunto">Assunto</label>
            <input
              type="text"
              id="assunto"
              placeholder="Ex: Laudo de insalubridade — Empresa X"
              value={campos.assunto}
              onChange={alterar('assunto')}
              required
            />
          </div>

          {ehGestor && (
            <div className="field-group">
              <label htmlFor="fiscal">Fiscal responsável</label>
              <select id="fiscal" value={campos.fiscalId} onChange={alterar('fiscalId')}>
                <option value="">Não atribuído</option>
                {fiscais.data?.map((fiscal) => (
                  <option key={fiscal.id} value={fiscal.id}>
                    {fiscal.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field-group">
            <label htmlFor="prazo">Prazo</label>
            <input type="date" id="prazo" value={campos.prazo} onChange={alterar('prazo')} required />
          </div>

          <div className="field-group">
            <label htmlFor="anexos">Anexos (PDF, DOC ou DOCX)</label>
            <input
              type="file"
              id="anexos"
              multiple
              accept=".pdf,.doc,.docx"
              onChange={(e) => setArquivos(Array.from(e.target.files ?? []))}
            />
          </div>

          {!ehGestor && (
            <p className="modal-dica">
              A demanda será registrada como aberta em campo e ficará em análise até um gestor validá-la.
            </p>
          )}

          <p className={`form-message ${mensagem ? 'error' : ''}`} role="alert">
            {mensagem}
          </p>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={enviando}>
              {enviando ? 'Criando…' : 'Criar demanda'}
            </button>
          </div>
      </form>
    </Modal>
  );
}
