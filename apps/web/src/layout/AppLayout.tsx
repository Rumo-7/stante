import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { sair } from '../api/auth';
import { useUsuarios } from '../api/usuarios';
import logo from '../assets/logo_stante.png';
import { ROTULO_PERFIL } from '../auth/perfis';
import { useUsuarioLogado } from '../auth/rotas';
import { SinoNotificacoes } from '../components/SinoNotificacoes';

export function AppLayout() {
  const usuario = useUsuarioLogado();
  const clienteQuery = useQueryClient();
  const navegar = useNavigate();

  const ehGestor = usuario.perfil === 'gestor';
  const pendentes = useUsuarios('pendente', ehGestor);
  const quantidadePendentes = pendentes.data?.length ?? 0;

  const logout = useMutation({
    mutationFn: sair,
    onSettled: () => {
      // Limpa todo o cache: nada do usuário anterior pode sobrar para o próximo
      clienteQuery.clear();
      navegar('/login', { replace: true });
    },
  });

  const classeDoLink = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-item active' : 'nav-item');

  return (
    <div className="app-shell">
      <nav className="navbar">
        <div className="navbar-logo">
          <img src={logo} alt="Stante" />
        </div>
        <div className="navbar-menu">
          <NavLink to="/dashboard" className={classeDoLink}>
            Dashboard
          </NavLink>
          <NavLink to="/demandas" className={classeDoLink}>
            Demandas
          </NavLink>
          <NavLink to="/prazos" className={classeDoLink}>
            Prazos
          </NavLink>
          {ehGestor && (
            <>
              <NavLink to="/fiscais" className={classeDoLink}>
                Fiscais
              </NavLink>
              <NavLink to="/usuarios" className={classeDoLink}>
                Usuários
                {quantidadePendentes > 0 && (
                  <span className="nav-contagem" title="Cadastros aguardando aprovação">
                    {quantidadePendentes}
                  </span>
                )}
              </NavLink>
            </>
          )}
        </div>
        <div className="navbar-user">
          {usuario.perfil !== 'representante' && <SinoNotificacoes />}
          <div className="user-info">
            <strong>{usuario.nome}</strong>
            <span>{ROTULO_PERFIL[usuario.perfil]}</span>
            <div className="acoes-conta">
              <Link to="/senha">Alterar senha</Link>
              <button type="button" className="btn-sair" onClick={() => logout.mutate()}>
                Sair
              </button>
            </div>
          </div>
        </div>
      </nav>

      <Outlet />
    </div>
  );
}
