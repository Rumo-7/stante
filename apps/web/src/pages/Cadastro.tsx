import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { cadastroSchema, PERFIS } from '@stante/shared';
import { cadastrar } from '../api/auth';
import { mensagemDeErro } from '../api/cliente';
import logo from '../assets/logo_stante.png';
import { ROTULO_PERFIL } from '../auth/perfis';

type Mensagem = { texto: string; tipo: 'error' | 'success' };

const CAMPOS_VAZIOS = { nome: '', email: '', perfil: '', senha: '', confirmarSenha: '' };

export function Cadastro() {
  const [campos, setCampos] = useState(CAMPOS_VAZIOS);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  const cadastro = useMutation({
    mutationFn: cadastrar,
    onSuccess: (resposta) => {
      setCampos(CAMPOS_VAZIOS);
      setMensagem({ texto: resposta.mensagem, tipo: 'success' });
    },
    onError: (erro) => setMensagem({ texto: mensagemDeErro(erro), tipo: 'error' }),
  });

  const alterar = (campo: keyof typeof CAMPOS_VAZIOS) => (e: { target: { value: string } }) =>
    setCampos((atual) => ({ ...atual, [campo]: e.target.value }));

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setMensagem(null);
    const dados = cadastroSchema.safeParse(campos);
    if (!dados.success) {
      setMensagem({ texto: dados.error.issues[0]?.message ?? 'Dados inválidos.', tipo: 'error' });
      return;
    }
    cadastro.mutate(dados.data);
  }

  return (
    <div className="pg-cadastro">
      <div className="body">
        <form className="form" onSubmit={aoEnviar} noValidate>
          <div className="form-logo">
            <img src={logo} alt="Stante - Gestão de Demandas" />
          </div>

          <h1>Solicite seu acesso</h1>

          <div className="field-group">
            <label htmlFor="nome">Nome completo</label>
            <input type="text" id="nome" placeholder="Digite seu nome completo" autoComplete="name" value={campos.nome} onChange={alterar('nome')} required />
          </div>

          <div className="field-group">
            <label htmlFor="email">Email</label>
            <input type="email" id="email" placeholder="Digite seu email" autoComplete="email" value={campos.email} onChange={alterar('email')} required />
          </div>

          <div className="field-group">
            <label htmlFor="perfil">Perfil</label>
            <select id="perfil" value={campos.perfil} onChange={alterar('perfil')} required>
              <option value="" disabled>
                Selecione seu perfil
              </option>
              {PERFIS.map((perfil) => (
                <option key={perfil} value={perfil}>
                  {ROTULO_PERFIL[perfil]}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label htmlFor="senha">Senha</label>
            <input type="password" id="senha" placeholder="Crie uma senha" autoComplete="new-password" value={campos.senha} onChange={alterar('senha')} required />
          </div>

          <div className="field-group">
            <label htmlFor="confirmarSenha">Confirmar senha</label>
            <input type="password" id="confirmarSenha" placeholder="Repita a senha" autoComplete="new-password" value={campos.confirmarSenha} onChange={alterar('confirmarSenha')} required />
          </div>

          <p className={`form-message ${mensagem?.tipo ?? ''}`} role="alert">
            {mensagem?.texto}
          </p>

          <button type="submit" disabled={cadastro.isPending}>
            {cadastro.isPending ? 'Enviando…' : 'Solicitar acesso'}
          </button>

          <Link className="back-link" to="/login">
            <span className="back-arrow">&larr;</span>
            Voltar para página de login
          </Link>
        </form>
      </div>
    </div>
  );
}
