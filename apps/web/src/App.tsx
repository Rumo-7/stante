import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { RotaProtegida, RotaPublica, SomentePerfil } from './auth/rotas';
import { Cadastro } from './pages/Cadastro';
import { Dashboard } from './pages/Dashboard';
import { Demandas } from './pages/Demandas';
import { Esqueci } from './pages/Esqueci';
import { Login } from './pages/Login';

function EmConstrucao({ titulo }: { titulo: string }) {
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>{titulo}</h1>
          <p className="page-subtitle">Esta tela ainda está sendo migrada para a nova versão.</p>
        </div>
      </header>
    </main>
  );
}

function NaoEncontrada() {
  return (
    <div className="tela-central">
      <div>
        <p>Página não encontrada.</p>
        <Link to="/dashboard">Voltar ao início</Link>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<RotaPublica />}>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/esqueci" element={<Esqueci />} />
      </Route>

      <Route element={<RotaProtegida />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/demandas" element={<Demandas />} />
          <Route path="/prazos" element={<EmConstrucao titulo="Prazos" />} />
          <Route
            path="/fiscais"
            element={
              <SomentePerfil perfis={['gestor']}>
                <EmConstrucao titulo="Fiscais" />
              </SomentePerfil>
            }
          />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NaoEncontrada />} />
    </Routes>
  );
}
