import cookieParser from 'cookie-parser';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { carregarUsuario, verificarOrigem } from './auth/middleware';
import { prisma } from './db';
import { env } from './env';
import { tratarErros } from './http/tratar-erros';
import { authRouter } from './modules/auth/auth.routes';
import { anexosRouter } from './modules/anexos/anexos.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { demandasRouter } from './modules/demandas/demandas.routes';
import { referenciaRouter } from './modules/referencia/referencia.routes';
import { usuariosRouter } from './modules/usuarios/usuarios.routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Atrás do proxy do Render: necessário para o IP real (rate limit) e cookie Secure
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(verificarOrigem);

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  });

  app.use('/api', carregarUsuario);
  app.use('/api', authRouter);
  app.use('/api/demandas', demandasRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/usuarios', usuariosRouter);
  app.use('/api', anexosRouter);
  app.use('/api', referenciaRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ erro: 'Rota não encontrada.' });
  });

  // Temporário: serve o front antigo (HTML/JS puro) até a Fase 2 (React).
  const frontAntigo = path.resolve(__dirname, '..', '..', '..', 'State', 'tela_inicial');
  if (fs.existsSync(frontAntigo)) {
    app.use(express.static(frontAntigo));
    app.get('/', (_req, res) => res.redirect('/ocorpo.html'));
  }

  app.use(tratarErros);

  return app;
}
