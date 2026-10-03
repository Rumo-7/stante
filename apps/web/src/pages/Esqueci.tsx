import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo_stante.png';

// A recuperação por e-mail ainda não existe no backend (depende de um serviço de
// envio de e-mails). Até lá, a tela explica o caminho em vez de fingir que enviou.
export function Esqueci() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviado(true);
  }

  return (
    <div className="pg-esqueci">
      <div className="body">
        <form className="form" onSubmit={aoEnviar}>
          <div className="form-logo">
            <img src={logo} alt="Stante - Gestão de Demandas" />
          </div>

          <h1>Esqueceu sua senha?</h1>

          <div className="field-group">
            <label htmlFor="email">Digite seu email de acesso</label>
            <input type="email" id="email" placeholder="Digite seu Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <button type="submit">Enviar</button>

          <Link className="back-link" to="/login">
            <span className="back-arrow">&larr;</span>
            Voltar para página de login
          </Link>

          <div className="divider"></div>

          <p className="helper-text">
            {enviado
              ? 'A recuperação de senha por e-mail ainda não está disponível. Em breve este recurso será liberado.'
              : 'Aguarde, esse processo pode demorar alguns segundos'}
          </p>
        </form>

        <svg className="bg-decor" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <circle cx="1500" cy="-40" r="320" fill="#1c3a30" opacity="0.6" />
          <circle cx="-80" cy="960" r="320" fill="#1c3a30" opacity="0.5" />
          <circle cx="1440" cy="60" r="380" fill="none" stroke="#CC8712" strokeWidth="1.5" opacity="0.7" />
          <circle cx="-60" cy="500" r="260" fill="none" stroke="#CC8712" strokeWidth="1.5" opacity="0.6" />
          <circle cx="1250" cy="-150" r="420" fill="none" stroke="#5a6b63" strokeWidth="1" strokeDasharray="2 6" opacity="0.5" />
          <circle cx="1120" cy="40" r="5" fill="#CC8712" />
          <circle cx="1300" cy="220" r="4" fill="#CC8712" />
          <circle cx="80" cy="640" r="5" fill="#CC8712" />
          <circle cx="200" cy="780" r="4" fill="#CC8712" />
          <circle cx="1180" cy="140" r="9" fill="#8f9c96" opacity="0.5" />
          <circle cx="140" cy="700" r="8" fill="#8f9c96" opacity="0.5" />
        </svg>
      </div>
    </div>
  );
}
