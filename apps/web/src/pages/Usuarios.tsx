import { useState } from 'react';
import type { Perfil, StatusUsuario } from '@stante/shared';
import { api, mensagemDeErro } from '../api/cliente';
import { useDemandantes } from '../api/demandas';
import { useFiscais, type Fiscal } from '../api/fiscais';
import { useAtualizarUsuario, useRedefinirSenha, useUsuarios, type UsuarioAdmin } from '../api/usuarios';
import { ROTULO_PERFIL } from '../auth/perfis';
import { useUsuarioLogado } from '../auth/rotas';
import { Modal } from '../components/Modal';
import { formatarData } from '../util/data';

/** A senha provisória aparece só aqui e só agora: o servidor guarda apenas o hash dela. */
function ModalSenhaProvisoria({ nome, senha, onFechar }: { nome: string; senha: string; onFechar: () => void }) {
  const [copiada, setCopiada] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(senha);
      setCopiada(true);
    } catch {
      setCopiada(false); // sem permissão para copiar: a pessoa seleciona o texto na tela
    }
  }

  return (
    <Modal titulo="Senha provisória" subtitulo={`Para ${nome}`} onFechar={onFechar}>
      <p className="senha-provisoria" aria-label="Senha provisória">
        {senha}
      </p>
      <button type="button" className="btn-secondary" onClick={copiar}>
        {copiada ? 'Copiada!' : 'Copiar senha'}
      </button>
      <p className="modal-dica">
        Esta senha aparece <strong>só agora</strong> e não fica salva no sistema. Passe-a para a pessoa por um canal
        seguro. Ela será obrigada a trocá-la no primeiro acesso, e foi desconectada de todos os lugares.
      </p>
      <div className="modal-actions">
        <button type="button" className="btn-primary" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}

const CLASSE_STATUS: Record<StatusUsuario, { rotulo: string; classe: string }> = {
  pendente: { rotulo: 'AGUARDANDO', classe: 'badge-amber' },
  ativo: { rotulo: 'ATIVO', classe: 'badge-green' },
  bloqueado: { rotulo: 'BLOQUEADO', classe: 'badge-red' },
};

const PERFIS: Perfil[] = ['gestor', 'inspetor', 'representante'];

const FILTROS: { valor: '' | StatusUsuario; rotulo: string }[] = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'pendente', rotulo: 'Aguardando aprovação' },
  { valor: 'ativo', rotulo: 'Ativos' },
  { valor: 'bloqueado', rotulo: 'Bloqueados' },
];

function LinhaUsuario({
  usuario,
  euMesmo,
  fiscais,
  orgaos,
  aoErro,
}: {
  usuario: UsuarioAdmin;
  euMesmo: boolean;
  fiscais: Fiscal[];
  orgaos: { id: number; nome: string }[];
  aoErro: (mensagem: string | null) => void;
}) {
  const atualizar = useAtualizarUsuario();
  const redefinirSenha = useRedefinirSenha();
  const [ocupado, setOcupado] = useState(false);
  const [senhaProvisoria, setSenhaProvisoria] = useState<string | null>(null);
  const bloqueado = ocupado || atualizar.isPending;

  function redefinir() {
    aoErro(null);
    // Redefinir desconecta a pessoa na hora, então pede confirmação
    if (!window.confirm(`Redefinir a senha de ${usuario.nome}? Ela será desconectada de todos os lugares.`)) return;
    redefinirSenha.mutate(usuario.id, {
      onSuccess: (resposta) => setSenhaProvisoria(resposta.senhaProvisoria),
      onError: (erro) => aoErro(mensagemDeErro(erro)),
    });
  }

  async function aplicar(dados: Parameters<typeof atualizar.mutateAsync>[0]['dados']) {
    aoErro(null);
    try {
      await atualizar.mutateAsync({ id: usuario.id, dados });
    } catch (erro) {
      aoErro(mensagemDeErro(erro));
    }
  }

  async function vincularFiscal(valor: string) {
    if (valor !== 'novo') {
      await aplicar({ fiscalId: valor ? Number(valor) : null });
      return;
    }
    // "Criar fiscal com o nome deste usuário": cria o registro e já vincula
    setOcupado(true);
    aoErro(null);
    try {
      const criado = await api.post<Fiscal>('/fiscais', { nome: usuario.nome });
      await atualizar.mutateAsync({ id: usuario.id, dados: { fiscalId: criado.id } });
    } catch (erro) {
      aoErro(mensagemDeErro(erro));
    } finally {
      setOcupado(false);
    }
  }

  // Fiscais já vinculados a outra pessoa não aparecem como opção
  const fiscaisLivres = fiscais.filter((f) => f.usuarioId === null || f.usuarioId === usuario.id);
  const situacao = CLASSE_STATUS[usuario.status];

  return (
    <tr>
      <td>
        <strong>{usuario.nome}</strong>
        <div className="usuario-email">{usuario.email}</div>
        <div className="usuario-email">Cadastro em {formatarData(usuario.criadoEm)}</div>
      </td>
      <td>
        <select
          aria-label={`Perfil de ${usuario.nome}`}
          value={usuario.perfil}
          disabled={euMesmo || bloqueado}
          onChange={(e) => aplicar({ perfil: e.target.value as Perfil })}
        >
          {PERFIS.map((perfil) => (
            <option key={perfil} value={perfil}>
              {ROTULO_PERFIL[perfil]}
            </option>
          ))}
        </select>
      </td>
      <td>
        {usuario.perfil === 'inspetor' && (
          <select
            aria-label={`Fiscal de ${usuario.nome}`}
            value={usuario.fiscalId ?? ''}
            disabled={bloqueado}
            onChange={(e) => vincularFiscal(e.target.value)}
          >
            <option value="">Sem vínculo</option>
            {fiscaisLivres.map((fiscal) => (
              <option key={fiscal.id} value={fiscal.id}>
                {fiscal.nome}
              </option>
            ))}
            {!usuario.fiscalId && <option value="novo">+ Criar fiscal “{usuario.nome}”</option>}
          </select>
        )}
        {usuario.perfil === 'representante' && (
          <select
            aria-label={`Órgão de ${usuario.nome}`}
            value={usuario.demandanteId ?? ''}
            disabled={bloqueado}
            onChange={(e) => aplicar({ demandanteId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Sem vínculo</option>
            {orgaos.map((orgao) => (
              <option key={orgao.id} value={orgao.id}>
                {orgao.nome}
              </option>
            ))}
          </select>
        )}
        {usuario.perfil === 'gestor' && <span className="usuario-email">—</span>}
      </td>
      <td>
        <span className={`badge ${situacao.classe}`}>{situacao.rotulo}</span>
      </td>
      <td className="usuario-acoes">
        {euMesmo ? (
          <span className="usuario-email">Você</span>
        ) : (
          <>
            {usuario.status !== 'ativo' && (
              <button type="button" className="btn-primary" disabled={bloqueado} onClick={() => aplicar({ status: 'ativo' })}>
                {usuario.status === 'pendente' ? 'Aprovar' : 'Reativar'}
              </button>
            )}
            {usuario.status !== 'bloqueado' && (
              <button type="button" className="btn-secondary" disabled={bloqueado} onClick={() => aplicar({ status: 'bloqueado' })}>
                {usuario.status === 'pendente' ? 'Recusar' : 'Bloquear'}
              </button>
            )}
            {usuario.status === 'ativo' && (
              <button type="button" className="btn-secondary" disabled={redefinirSenha.isPending} onClick={redefinir}>
                Redefinir senha
              </button>
            )}
            {senhaProvisoria && (
              <ModalSenhaProvisoria
                nome={usuario.nome}
                senha={senhaProvisoria}
                onFechar={() => setSenhaProvisoria(null)}
              />
            )}
          </>
        )}
      </td>
    </tr>
  );
}

export function Usuarios() {
  const eu = useUsuarioLogado();
  const [filtro, setFiltro] = useState<'' | StatusUsuario>('');
  const [erro, setErro] = useState<string | null>(null);

  const usuarios = useUsuarios(filtro || undefined);
  const fiscais = useFiscais(true);
  const orgaos = useDemandantes();

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Usuários</h1>
          <p className="page-subtitle">Aprove cadastros e defina o perfil e o vínculo de cada pessoa</p>
        </div>
      </header>

      <section className="card filtros-card">
        <div className="filtros-row">
          <div className="field-group">
            <label htmlFor="filtro-usuarios">Mostrar</label>
            <select id="filtro-usuarios" value={filtro} onChange={(e) => setFiltro(e.target.value as '' | StatusUsuario)}>
              {FILTROS.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <p className="modal-dica">
        Inspetores só veem demandas depois de vinculados a um fiscal; representantes, depois de vinculados a um órgão.
      </p>

      {erro && (
        <p className="form-message error" role="alert">
          {erro}
        </p>
      )}

      <section className="card">
        <table className="demandas-table">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Perfil</th>
              <th>Vínculo</th>
              <th>Situação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.isPending && (
              <tr>
                <td colSpan={5} className="empty-state">
                  Carregando…
                </td>
              </tr>
            )}
            {usuarios.error && (
              <tr>
                <td colSpan={5} className="estado-erro">
                  {mensagemDeErro(usuarios.error)}
                </td>
              </tr>
            )}
            {usuarios.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-state">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
            {usuarios.data?.map((usuario) => (
              <LinhaUsuario
                key={usuario.id}
                usuario={usuario}
                euMesmo={usuario.id === eu.id}
                fiscais={fiscais.data ?? []}
                orgaos={orgaos.data ?? []}
                aoErro={setErro}
              />
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
