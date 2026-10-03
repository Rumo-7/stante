import type { ErrorRequestHandler } from 'express';
import { ErroHttp } from './erros';

export const tratarErros: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ErroHttp) {
    res.status(err.status).json({ erro: err.message });
    return;
  }

  // Erros do body-parser do Express
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ erro: 'JSON inválido.' });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ erro: 'Requisição grande demais.' });
    return;
  }

  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
};
