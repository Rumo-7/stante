import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { prisma } from './db';

let pastaWeb: string;

beforeAll(() => {
  // Simula o front compilado (apps/web/dist)
  pastaWeb = fs.mkdtempSync(path.join(os.tmpdir(), 'stante-web-'));
  fs.writeFileSync(path.join(pastaWeb, 'index.html'), '<!doctype html><title>Stante</title><div id="root"></div>');
  fs.mkdirSync(path.join(pastaWeb, 'assets'));
  fs.writeFileSync(path.join(pastaWeb, 'assets', 'index-abc123.js'), 'console.log("ok")');
});

afterAll(async () => {
  fs.rmSync(pastaWeb, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('servindo o front compilado', () => {
  it('a raiz e as rotas do React Router devolvem o index.html', async () => {
    const app = createApp({ pastaWeb });
    for (const rota of ['/', '/login', '/demandas', '/usuarios']) {
      const res = await request(app).get(rota);
      expect(res.status, rota).toBe(200);
      expect(res.text, rota).toContain('<div id="root">');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('arquivos em /assets são servidos com cache longo', async () => {
    const res = await request(createApp({ pastaWeb })).get('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/max-age=31536000/);
    expect(res.headers['cache-control']).toMatch(/immutable/);
  });

  it('asset inexistente é 404, não o index.html', async () => {
    const res = await request(createApp({ pastaWeb })).get('/assets/sumiu-123.js');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('<div id="root">');
  });

  it('rota de API inexistente continua sendo 404 em JSON, não o index.html', async () => {
    const res = await request(createApp({ pastaWeb })).get('/api/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.erro).toBeDefined();
    expect(res.text).not.toContain('<div id="root">');
  });

  it('sem a pasta do front (desenvolvimento), só a API responde', async () => {
    const app = createApp({ pastaWeb: path.join(pastaWeb, 'nao-existe') });
    await request(app).get('/api/health').expect(200);
    await request(app).get('/demandas').expect(404);
  });
});

describe('cabeçalhos de segurança', () => {
  it('define CSP restritiva, bloqueia embutir em iframe e não revela o Express', async () => {
    const res = await request(createApp({ pastaWeb })).get('/login');
    const csp = res.headers['content-security-policy'] ?? '';

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('upgrade-insecure-requests'); // só em produção (https)
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('os cabeçalhos valem também para as respostas da API', async () => {
    const res = await request(createApp({ pastaWeb })).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});
