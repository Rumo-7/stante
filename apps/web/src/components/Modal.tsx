import { useEffect, useId, type ReactNode } from 'react';

/** Janela sobre a tela: fecha com Esc ou clicando fora, e é anunciada como diálogo. */
export function Modal({
  titulo,
  subtitulo,
  onFechar,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  onFechar: () => void;
  children: ReactNode;
}) {
  const idTitulo = useId();

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={idTitulo}>
        <h2 id={idTitulo}>{titulo}</h2>
        {subtitulo && <p className="card-subtitle">{subtitulo}</p>}
        {children}
      </div>
    </div>
  );
}
