import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema } from '@stante/shared';
import { entrar } from '../api/auth';
import { mensagemDeErro } from '../api/cliente';
import { CHAVE_USUARIO } from '../auth/rotas';
import googleIcone from '../assets/google.png';
import govbrIcone from '../assets/govbr.png';

type Mensagem = { texto: string; tipo: 'error' | 'success' };

export function Login() {
  const navegar = useNavigate();
  const local = useLocation();
  const clienteQuery = useQueryClient();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  const login = useMutation({
    mutationFn: entrar,
    onSuccess: async () => {
      await clienteQuery.invalidateQueries({ queryKey: CHAVE_USUARIO });
      const destino = (local.state as { de?: string } | null)?.de ?? '/dashboard';
      navegar(destino, { replace: true });
    },
    onError: (erro) => setMensagem({ texto: mensagemDeErro(erro), tipo: 'error' }),
  });

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);
    const dados = loginSchema.safeParse({ email, senha });
    if (!dados.success) {
      setMensagem({ texto: dados.error.issues[0]?.message ?? 'Dados inválidos.', tipo: 'error' });
      return;
    }
    login.mutate(dados.data);
  }

  const emBreve = (provedor: string) =>
    setMensagem({ texto: `Login com ${provedor} ainda não está disponível.`, tipo: 'error' });

  return (
    <div className="pg-login">
      <main className="login-container">
        <section className="login-form">
          <div className="form-content">
            <h1>Acesse sua conta!</h1>
            <p className="subtitle">Centralize, acompanhe e responda suas demandas.</p>

            <form onSubmit={aoEnviar} noValidate>
              <div className="input-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="Digite seu email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <div className="password-header">
                  <label htmlFor="senha">Senha</label>
                  <Link to="/esqueci">Esqueceu sua senha?</Link>
                </div>
                <div className="password-field">
                  <input
                    type={mostrarSenha ? 'text' : 'password'}
                    id="senha"
                    name="senha"
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setMostrarSenha((v) => !v)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {mostrarSenha ? (
                        <>
                          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.6 18.6 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              <div className="terms">
                <input type="checkbox" id="terms" />
                <label htmlFor="terms">
                  Eu concordo com os <a href="#">termos e política de privacidade</a>
                </label>
              </div>

              <button type="submit" className="login-button" disabled={login.isPending}>
                {login.isPending ? 'Entrando…' : 'Entrar'}
              </button>

              <p className={`form-message ${mensagem?.tipo ?? ''}`} role="alert">
                {mensagem?.texto}
              </p>
            </form>

            <div className="divider">
              <span></span>
              <p>ou</p>
              <span></span>
            </div>

            <div className="social-login">
              <button type="button" className="social-button" onClick={() => emBreve('o Google')}>
                <img className="social-icon" src={googleIcone} alt="" />
                Entrar com o Google
              </button>
              <button type="button" className="social-button" onClick={() => emBreve('o gov.br')}>
                <img className="social-icon" src={govbrIcone} alt="" />
                Entrar com o gov.br
              </button>
            </div>

            <p className="register">
              Não tem uma conta? <Link to="/cadastro">Solicite acesso</Link>
            </p>
          </div>
        </section>

        <section className="brand-panel"></section>
      </main>
    </div>
  );
}
