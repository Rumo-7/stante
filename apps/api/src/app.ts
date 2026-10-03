import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { carregarUsuario, verificarOrigem } from './auth/middleware';
import { prisma } from './db';
import { env } from './env';
import { tratarErros } from './http/tratar-erros';
import { anexosRouter } from './modules/anexos/anexos.routes';
import { authRouter } from './modules/auth/auth.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { demandasRouter } from './modules/demandas/demandas.routes';
import { referenciaRouter } from './modules/referencia/referencia.routes';
import { usuariosRouter } from './modules/usuarios/usuarios.routes';

// apps/api/src ou apps/api/dist -> apps/web/dist (o front compilado)
const PASTA_WEB_PADRAO = path.resolve(__dirname, '..', '..', 'web', 'dist');

interface OpcoesApp {
  /** Pasta do front compilado. Se não existir (ex.: em desenvolvimento), só a API é servida. */
  pastaWeb?: string;
}

export function createApp({ pastaWeb = PASTA_WEB_PADRAO }: OpcoesApp = {}) {
  const app = express();

  app.disable('x-powered-by');
  // Atrás do proxy do Render: necessário para o IP real (rate limit), o host (checagem de Origin) e o cookie Secure
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          // 'unsafe-inline' só para estilos: bibliotecas de interface costumam precisar
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'object-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          // Em http local isso quebraria o carregamento; em produção (https) vale
          'upgrade-insecure-requests': env.NODE_ENV === 'production' ? [] : null,
        },
      },
    }),
  );

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

  const indexHtml = path.join(pastaWeb, 'index.html');
  if (fs.existsSync(indexHtml)) {
    // Arquivos em /assets têm o hash no nome: podem ficar em cache "para sempre"
    app.use('/assets', express.static(path.join(pastaWeb, 'assets'), { immutable: true, maxAge: '1y' }));
    // Asset que não existe é 404 de verdade, e não o index.html disfarçado de JavaScript
    app.use('/assets', (_req, res) => {
      res.status(404).end();
    });
    app.use(express.static(pastaWeb, { index: false }));

    // Qualquer outro GET é uma rota do React Router (ex.: /demandas ao recarregar a página)
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  app.use(tratarErros);

  return app;
}
