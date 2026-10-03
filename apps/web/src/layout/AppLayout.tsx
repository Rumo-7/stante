import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { sair } from '../api/auth';
import logo from '../assets/logo_stante.png';
import { ROTULO_PERFIL } from '../auth/perfis';
import { useUsuarioLogado } from '../auth/rotas';

export function AppLayout() {
  const usuario = useUsuarioLogado();
  const clienteQuery = useQueryClient();
  const navegar = useNavigate();

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
          {usuario.perfil === 'gestor' && (
            <NavLink to="/fiscais" className={classeDoLink}>
              Fiscais
            </NavLink>
          )}
        </div>
        <div className="navbar-user">
          <div className="user-info">
            <strong>{usuario.nome}</strong>
            <span>{ROTULO_PERFIL[usuario.perfil]}</span>
            <button type="button" className="btn-sair" onClick={() => logout.mutate()}>
              Sair
            </button>
          </div>
        </div>
      </nav>

      <Outlet />
    </div>
  );
}
