import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarcarLida, useMarcarTodasLidas, useNotificacoes, type Notificacao } from '../api/notificacoes';
import { formatarInstante } from '../util/data';

/** O sino da barra de navegação: avisos de prazo e de movimentação das demandas. */
export function SinoNotificacoes() {
  const navegar = useNavigate();
  const { data } = useNotificacoes(true);
  const marcarLida = useMarcarLida();
  const marcarTodas = useMarcarTodasLidas();

  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  const naoLidas = data?.naoLidas ?? 0;

  function abrirAviso(aviso: Notificacao) {
    if (!aviso.lida) marcarLida.mutate(aviso.id);
    setAberto(false);
    if (aviso.demandaId) navegar(`/demandas?abrir=${aviso.demandaId}`);
  }

  return (
    <div className="sino" ref={raiz}>
      <button
        type="button"
        className="sino-botao"
        aria-label={naoLidas > 0 ? `Avisos, ${naoLidas} não lido(s)` : 'Avisos'}
        aria-expanded={aberto}
        onClick={() => setAberto((valor) => !valor)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {naoLidas > 0 && <span className="sino-contagem">{naoLidas > 99 ? '99+' : naoLidas}</span>}
      </button>

      {aberto && (
        <div className="sino-painel" role="dialog" aria-label="Avisos">
          <div className="sino-cabecalho">
            <strong>Avisos</strong>
            {naoLidas > 0 && (
              <button type="button" className="sino-acao" onClick={() => marcarTodas.mutate()}>
                Marcar todos como lidos
              </button>
            )}
          </div>

          {data?.itens.length === 0 && <p className="empty-state sino-vazio">Nenhum aviso por enquanto.</p>}

          <ul className="sino-lista">
            {data?.itens.map((aviso) => (
              <li key={aviso.id}>
                <button
                  type="button"
                  className={`sino-item ${aviso.lida ? '' : 'nao-lida'}`}
                  onClick={() => abrirAviso(aviso)}
                >
                  <span>{aviso.mensagem}</span>
                  <span className="sino-quando">{formatarInstante(aviso.criadaEm)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
