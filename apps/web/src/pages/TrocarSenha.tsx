import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { trocarSenhaSchema } from '@stante/shared';
import { sair, trocarSenha } from '../api/auth';
import { mensagemDeErro } from '../api/cliente';
import logo from '../assets/logo_stante.png';
import { CHAVE_USUARIO, useUsuarioLogado } from '../auth/rotas';

type Mensagem = { texto: string; tipo: 'error' | 'success' };

const CAMPOS_VAZIOS = { senhaAtual: '', novaSenha: '', confirmarNovaSenha: '' };

/**
 * Troca de senha. Quando a pessoa acabou de receber uma senha provisória do gestor,
 * esta é a única tela que ela vê, até criar uma senha só dela.
 */
export function TrocarSenha() {
  const usuario = useUsuarioLogado();
  const obrigatoria = usuario.precisaTrocarSenha;
  const clienteQuery = useQueryClient();
  const navegar = useNavigate();

  const [campos, setCampos] = useState(CAMPOS_VAZIOS);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  const troca = useMutation({
    mutationFn: trocarSenha,
    onSuccess: async () => {
      setCampos(CAMPOS_VAZIOS);
      await clienteQuery.invalidateQueries({ queryKey: CHAVE_USUARIO });
      if (obrigatoria) navegar('/dashboard', { replace: true });
      else
        setMensagem({
          texto: 'Senha alterada. Em outros dispositivos você precisará entrar de novo.',
          tipo: 'success',
        });
    },
    onError: (erro) => setMensagem({ texto: mensagemDeErro(erro), tipo: 'error' }),
  });

  const logout = useMutation({
    mutationFn: sair,
    onSettled: () => {
      clienteQuery.clear();
      navegar('/login', { replace: true });
    },
  });

  const alterar = (campo: keyof typeof CAMPOS_VAZIOS) => (e: { target: { value: string } }) =>
    setCampos((atual) => ({ ...atual, [campo]: e.target.value }));

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);
    const dados = trocarSenhaSchema.safeParse(campos);
    if (!dados.success) {
      setMensagem({ texto: dados.error.issues[0]?.message ?? 'Dados inválidos.', tipo: 'error' });
      return;
    }
    troca.mutate(dados.data);
  }

  return (
    <div className="pg-cadastro">
      <div className="body">
        <form className="form" onSubmit={aoEnviar} noValidate>
          <div className="form-logo">
            <img src={logo} alt="Stante - Gestão de Demandas" />
          </div>

          <h1>{obrigatoria ? 'Crie a sua senha' : 'Alterar senha'}</h1>
          {obrigatoria && (
            <p className="form-intro">
              Você entrou com uma senha provisória. Crie uma senha só sua para continuar.
            </p>
          )}

          <div className="field-group">
            <label htmlFor="senhaAtual">{obrigatoria ? 'Senha provisória' : 'Senha atual'}</label>
            <input
              type="password"
              id="senhaAtual"
              autoComplete="current-password"
              value={campos.senhaAtual}
              onChange={alterar('senhaAtual')}
              required
            />
          </div>

          <div className="field-group">
            <label htmlFor="novaSenha">Nova senha</label>
            <input
              type="password"
              id="novaSenha"
              placeholder="Pelo menos 8 caracteres"
              autoComplete="new-password"
              value={campos.novaSenha}
              onChange={alterar('novaSenha')}
              required
            />
          </div>

          <div className="field-group">
            <label htmlFor="confirmarNovaSenha">Confirmar nova senha</label>
            <input
              type="password"
              id="confirmarNovaSenha"
              autoComplete="new-password"
              value={campos.confirmarNovaSenha}
              onChange={alterar('confirmarNovaSenha')}
              required
            />
          </div>

          <p className={`form-message ${mensagem?.tipo ?? ''}`} role="alert">
            {mensagem?.texto}
          </p>

          <button type="submit" disabled={troca.isPending}>
            {troca.isPending ? 'Salvando…' : 'Salvar nova senha'}
          </button>

          {obrigatoria ? (
            <button type="button" className="botao-link" onClick={() => logout.mutate()}>
              Sair
            </button>
          ) : (
            <Link className="back-link" to="/dashboard">
              <span className="back-arrow">&larr;</span>
              Voltar
            </Link>
          )}
        </form>
      </div>
    </div>
  );
}
