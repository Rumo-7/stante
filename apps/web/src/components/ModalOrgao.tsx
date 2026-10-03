import { useState, type FormEvent } from 'react';
import {
  atualizarDemandanteSchema,
  criarDemandanteSchema,
  ROTULO_TIPO_DEMANDANTE,
  TIPOS_DEMANDANTE,
  type TipoDemandante,
} from '@stante/shared';
import { mensagemDeErro } from '../api/cliente';
import { useAtualizarOrgao, useCriarOrgao } from '../api/demandantes';
import { Modal } from './Modal';

/** Cadastro de um órgão novo ou edição (nome e categoria) de um existente. */
export function ModalOrgao({
  orgao,
  onFechar,
}: {
  orgao?: { id: number; nome: string; tipo: string };
  onFechar: () => void;
}) {
  const criar = useCriarOrgao();
  const atualizar = useAtualizarOrgao();
  const [nome, setNome] = useState(orgao?.nome ?? '');
  const [tipo, setTipo] = useState(orgao?.tipo ?? 'outro');
  const [mensagem, setMensagem] = useState<string | null>(null);

  const emEdicao = Boolean(orgao);
  const pendente = criar.isPending || atualizar.isPending;

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);

    const opcoes = { onSuccess: onFechar, onError: (erro: unknown) => setMensagem(mensagemDeErro(erro)) };
    if (orgao) {
      const dados = atualizarDemandanteSchema.safeParse({ nome, tipo });
      if (!dados.success) return setMensagem(dados.error.issues[0]?.message ?? 'Dados inválidos.');
      atualizar.mutate({ id: orgao.id, dados: dados.data }, opcoes);
    } else {
      const dados = criarDemandanteSchema.safeParse({ nome, tipo });
      if (!dados.success) return setMensagem(dados.error.issues[0]?.message ?? 'Dados inválidos.');
      criar.mutate(dados.data, opcoes);
    }
  }

  return (
    <Modal titulo={emEdicao ? 'Editar órgão' : 'Novo órgão'} onFechar={onFechar}>
      <form onSubmit={aoEnviar} noValidate>
        <div className="field-group">
          <label htmlFor="orgao-nome">Nome</label>
          <input
            type="text"
            id="orgao-nome"
            placeholder="Ex: Ministério Público do Trabalho (MPT)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
        </div>
        <div className="field-group">
          <label htmlFor="orgao-tipo">Categoria</label>
          <select id="orgao-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_DEMANDANTE.map((valor: TipoDemandante) => (
              <option key={valor} value={valor}>
                {ROTULO_TIPO_DEMANDANTE[valor]}
              </option>
            ))}
          </select>
        </div>
        <p className="modal-dica">
          A categoria agrupa órgãos parecidos no gráfico "Demandas por demandante" do dashboard. Dica: coloque a sigla
          entre parênteses no fim do nome, que ela aparece no eixo dos gráficos.
        </p>
        <p className={`form-message ${mensagem ? 'error' : ''}`} role="alert">
          {mensagem}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={pendente}>
            {pendente ? 'Salvando…' : emEdicao ? 'Salvar' : 'Cadastrar órgão'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
