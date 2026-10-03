import { useState, type FormEvent } from 'react';
import { criarFiscalSchema } from '@stante/shared';
import { mensagemDeErro } from '../api/cliente';
import { useCriarFiscal, useFiscais, type Fiscal } from '../api/fiscais';
import logo from '../assets/logo_stante.png';
import { Modal } from '../components/Modal';

const CORES_AVATAR = ['#CC8712', '#142721', '#315f28', '#8f4e10', '#1c3a30', '#b3261e'];

function iniciais(nome: string): string {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]!.toUpperCase())
    .join('');
}

function corDoAvatar(nome: string): string {
  let soma = 0;
  for (let i = 0; i < nome.length; i += 1) soma += nome.charCodeAt(i);
  return CORES_AVATAR[soma % CORES_AVATAR.length]!;
}

function cargaDe(quantidade: number): { rotulo: string; classe: string } {
  if (quantidade === 0) return { rotulo: 'SEM DEMANDAS', classe: 'badge-gray' };
  if (quantidade <= 2) return { rotulo: 'CARGA BAIXA', classe: 'badge-green' };
  if (quantidade <= 5) return { rotulo: 'CARGA MÉDIA', classe: 'badge-amber' };
  return { rotulo: 'CARGA ALTA', classe: 'badge-red' };
}

function CartaoFiscal({ fiscal }: { fiscal: Fiscal }) {
  const carga = cargaDe(fiscal.demandas_ativas);
  return (
    <div className="fiscal-card">
      <div className="fiscal-card-header">
        <div className="fiscal-avatar" style={{ background: corDoAvatar(fiscal.nome) }}>
          {iniciais(fiscal.nome)}
        </div>
        <div>
          <div className="fiscal-name">{fiscal.nome}</div>
          <div className="fiscal-especialidade">{fiscal.especialidade ?? 'Especialidade não informada'}</div>
        </div>
      </div>
      <div className="fiscal-stats">
        <div className="valor">{fiscal.demandas_ativas}</div>
        <p className="rotulo">demanda(s) ativa(s)</p>
        <span className={`badge ${carga.classe}`}>{carga.rotulo}</span>
        <p className="fiscal-acesso">
          {fiscal.usuarioId ? 'Tem acesso ao sistema' : 'Sem acesso ao sistema'}
        </p>
      </div>
      <div className="fiscal-footer">
        <img src={logo} alt="" />
        <span>VISAT/CEREST Recife</span>
      </div>
    </div>
  );
}

function NovoFiscalModal({ onFechar }: { onFechar: () => void }) {
  const criar = useCriarFiscal();
  const [nome, setNome] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);
    const dados = criarFiscalSchema.safeParse({ nome, especialidade });
    if (!dados.success) {
      setMensagem(dados.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    criar.mutate(dados.data, {
      onSuccess: onFechar,
      onError: (erro) => setMensagem(mensagemDeErro(erro)),
    });
  }

  return (
    <Modal titulo="Novo Fiscal" onFechar={onFechar}>
      <form onSubmit={aoEnviar} noValidate>
        <div className="field-group">
          <label htmlFor="fiscal-nome">Nome completo</label>
          <input
            type="text"
            id="fiscal-nome"
            placeholder="Ex: Ana Beatriz Lima"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
        </div>
        <div className="field-group">
          <label htmlFor="fiscal-especialidade">Especialidade</label>
          <input
            type="text"
            id="fiscal-especialidade"
            placeholder="Ex: Segurança do Trabalho"
            value={especialidade}
            onChange={(e) => setEspecialidade(e.target.value)}
          />
        </div>
        <p className={`form-message ${mensagem ? 'error' : ''}`} role="alert">
          {mensagem}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={criar.isPending}>
            {criar.isPending ? 'Adicionando…' : 'Adicionar fiscal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Fiscais() {
  const fiscais = useFiscais(true);
  const [modalAberto, setModalAberto] = useState(false);

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Fiscais</h1>
          <p className="page-subtitle">Equipe de inspetores da VISAT/CEREST Recife</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setModalAberto(true)}>
          + Novo Fiscal
        </button>
      </header>

      {fiscais.isPending && <p>Carregando fiscais…</p>}
      {fiscais.error && <p className="estado-erro">{mensagemDeErro(fiscais.error)}</p>}
      {fiscais.data?.length === 0 && <p className="empty-state">Nenhum fiscal cadastrado ainda.</p>}

      <section className="fiscais-grid">
        {fiscais.data?.map((fiscal) => <CartaoFiscal key={fiscal.id} fiscal={fiscal} />)}
      </section>

      {modalAberto && <NovoFiscalModal onFechar={() => setModalAberto(false)} />}
    </main>
  );
}
