import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { adicionarDias, hojeNoFuso } from '@stante/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';
import {
  criarDemanda,
  criarDemandante,
  criarFiscal,
  criarUsuarioComSessao,
  data,
  limparBanco,
} from '../../test/fixtures';

const app = createApp();
const em = (dias: number) => adicionarDias(hojeNoFuso(), dias);
const pastaUploads = () => path.resolve(process.cwd(), process.env.UPLOAD_DIR!);
const arquivosNoDisco = () => (fs.existsSync(pastaUploads()) ? fs.readdirSync(pastaUploads()) : []);

const PDF = Buffer.from('%PDF-1.4\nconteudo de teste\n%%EOF');
const DOCX = Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.from('....word/document.xml....')]);
const DOC = Buffer.concat([Buffer.from('D0CF11E0A1B11AE1', 'hex'), Buffer.alloc(32)]);

beforeEach(async () => {
  await limparBanco();
  for (const arquivo of arquivosNoDisco()) fs.rmSync(path.join(pastaUploads(), arquivo), { force: true });
});
afterAll(() => prisma.$disconnect());

async function demandaBase(extra = {}) {
  const demandante = await criarDemandante();
  const demanda = await criarDemanda({ demandanteId: demandante.id, assunto: 'x', prazo: data(em(30)), ...extra });
  return { demandante, demanda };
}

const enviar = (cookie: string, demandaId: number, arquivo: Buffer, nome = 'doc.pdf') =>
  request(app).post(`/api/demandas/${demandaId}/anexos`).set('Cookie', cookie).attach('anexos', arquivo, nome);

describe('envio de anexos', () => {
  it('aceita PDF, DOC e DOCX e guarda o tipo detectado nos bytes', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const { demanda } = await demandaBase();

    await enviar(cookie, demanda.id, PDF, 'a.pdf').expect(201);
    await enviar(cookie, demanda.id, DOC, 'b.doc').expect(201);
    const res = await enviar(cookie, demanda.id, DOCX, 'c.docx').expect(201);

    expect(res.body.map((a: { nomeOriginal: string }) => a.nomeOriginal)).toEqual(['a.pdf', 'b.doc', 'c.docx']);
    const salvos = await prisma.anexo.findMany({ orderBy: { id: 'asc' } });
    expect(salvos.map((a) => a.mimeType)).toEqual([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    expect(arquivosNoDisco()).toHaveLength(3);
  });

  it('recusa arquivo que só diz ser PDF (mimetype e extensão forjados)', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const { demanda } = await demandaBase();

    const res = await request(app)
      .post(`/api/demandas/${demanda.id}/anexos`)
      .set('Cookie', cookie)
      .attach('anexos', Buffer.from('#!/bin/sh\necho invadido'), { filename: 'falso.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/Tipo de arquivo não permitido/);
    expect(await prisma.anexo.count()).toBe(0);
    expect(arquivosNoDisco()).toHaveLength(0);
  });

  it('recusa ZIP que não é DOCX', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const { demanda } = await demandaBase();
    const zip = Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.from('....pasta/outra.txt....')]);
    await enviar(cookie, demanda.id, zip, 'x.docx').expect(400);
  });

  it('um arquivo inválido no lote impede que qualquer um seja gravado', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const { demanda } = await demandaBase();

    await request(app)
      .post(`/api/demandas/${demanda.id}/anexos`)
      .set('Cookie', cookie)
      .attach('anexos', PDF, 'ok.pdf')
      .attach('anexos', Buffer.from('texto puro'), 'ruim.pdf')
      .expect(400);

    expect(await prisma.anexo.count()).toBe(0);
    expect(arquivosNoDisco()).toHaveLength(0);
  });

  it('recusa arquivo acima de 10 MB', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const { demanda } = await demandaBase();
    const grande = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(11 * 1024 * 1024)]);
    const res = await enviar(cookie, demanda.id, grande);
    expect(res.status).toBe(413);
    expect(arquivosNoDisco()).toHaveLength(0);
  });

  it('exige ao menos um arquivo', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const { demanda } = await demandaBase();
    const res = await request(app).post(`/api/demandas/${demanda.id}/anexos`).set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Selecione ao menos um arquivo.');
  });

  it('nome com caminho vira só o nome do arquivo, e a chave em disco não usa o nome enviado', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const { demanda } = await demandaBase();

    await request(app)
      .post(`/api/demandas/${demanda.id}/anexos`)
      .set('Cookie', cookie)
      .attach('anexos', PDF, { filename: '../../etc/passwd.pdf', contentType: 'application/pdf' })
      .expect(201);

    const anexo = await prisma.anexo.findFirstOrThrow();
    expect(anexo.nomeOriginal).toBe('passwd.pdf');
    expect(anexo.chaveArquivo).toMatch(/^[0-9a-f-]{36}\.pdf$/);
  });

  it('informa quem enviou cada anexo', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const { demanda } = await demandaBase();
    const res = await enviar(gestor.cookie, demanda.id, PDF).expect(201);
    expect(res.body[0].enviadoPorId).toBe(gestor.user.id);
  });

  it('preserva acentos no nome do arquivo', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const { demanda } = await demandaBase();
    const res = await enviar(cookie, demanda.id, PDF, 'relatório técnico.pdf').expect(201);
    expect(res.body[0].nomeOriginal).toBe('relatório técnico.pdf');
  });
});

describe('permissões de anexos', () => {
  it('exige login', async () => {
    const { demanda } = await demandaBase();
    await request(app).get(`/api/demandas/${demanda.id}/anexos`).expect(401);
    await request(app).get('/api/anexos/1/download').expect(401);
    await request(app).delete('/api/anexos/1').expect(401);
  });

  it('inspetor anexa à demanda dele, inclusive em análise, mas não à de outro fiscal', async () => {
    const { user, cookie } = await criarUsuarioComSessao('inspetor');
    const meuFiscal = await criarFiscal('Meu', user.id);
    const outro = await criarFiscal('Outro');
    const { demanda: minhaEmAnalise } = await demandaBase({ fiscalId: meuFiscal.id, status: 'em_analise', origem: 'campo' });
    const { demanda: alheia } = await demandaBase({ fiscalId: outro.id });

    await enviar(cookie, minhaEmAnalise.id, PDF).expect(201);
    await enviar(cookie, alheia.id, PDF).expect(404);
    expect(await prisma.anexo.count()).toBe(1);
  });

  it('representante lê anexos do órgão dele, mas não envia nem apaga', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const { demandante, demanda } = await demandaBase();
    const representante = await criarUsuarioComSessao('representante', { demandanteId: demandante.id });

    const enviado = await enviar(gestor.cookie, demanda.id, PDF).expect(201);
    const id = enviado.body[0].id;

    await request(app).get(`/api/demandas/${demanda.id}/anexos`).set('Cookie', representante.cookie).expect(200);
    await request(app).get(`/api/anexos/${id}/download`).set('Cookie', representante.cookie).expect(200);
    await enviar(representante.cookie, demanda.id, PDF).expect(403);
    await request(app).delete(`/api/anexos/${id}`).set('Cookie', representante.cookie).expect(403);
  });

  it('representante de outro órgão não enxerga o anexo (404)', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const { demanda } = await demandaBase();
    const outroOrgao = await criarDemandante('Outro órgão');
    const intruso = await criarUsuarioComSessao('representante', { demandanteId: outroOrgao.id });

    const enviado = await enviar(gestor.cookie, demanda.id, PDF).expect(201);
    await request(app).get(`/api/demandas/${demanda.id}/anexos`).set('Cookie', intruso.cookie).expect(404);
    await request(app).get(`/api/anexos/${enviado.body[0].id}/download`).set('Cookie', intruso.cookie).expect(404);
  });

  it('inspetor remove só o que ele mesmo enviou; o gestor remove qualquer anexo', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const inspetor = await criarUsuarioComSessao('inspetor');
    const fiscal = await criarFiscal('Meu', inspetor.user.id);
    const { demanda } = await demandaBase({ fiscalId: fiscal.id });

    const doGestor = (await enviar(gestor.cookie, demanda.id, PDF).expect(201)).body[0].id;
    const doInspetor = (await enviar(inspetor.cookie, demanda.id, PDF).expect(201)).body.at(-1).id;

    await request(app).delete(`/api/anexos/${doGestor}`).set('Cookie', inspetor.cookie).expect(403);
    await request(app).delete(`/api/anexos/${doInspetor}`).set('Cookie', inspetor.cookie).expect(200);
    await request(app).delete(`/api/anexos/${doGestor}`).set('Cookie', gestor.cookie).expect(200);

    expect(await prisma.anexo.count()).toBe(0);
    expect(arquivosNoDisco()).toHaveLength(0);
  });
});

describe('download', () => {
  it('devolve o conteúdo original com cabeçalhos seguros', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const { demanda } = await demandaBase();
    const enviado = await enviar(cookie, demanda.id, PDF, 'relatório.pdf').expect(201);

    const res = await request(app)
      .get(`/api/anexos/${enviado.body[0].id}/download`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse((resposta, callback) => {
        const pedacos: Buffer[] = [];
        resposta.on('data', (p: Buffer) => pedacos.push(p));
        resposta.on('end', () => callback(null, Buffer.concat(pedacos)));
      });

    expect(res.status).toBe(200);
    expect(res.body.equals(PDF)).toBe(true);
    expect(res.headers['content-type']).toMatch(/^application\/pdf/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    expect(decodeURIComponent(res.headers['content-disposition']!)).toContain('relatório.pdf');
  });

  it('responde 404 se o arquivo sumiu do disco', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const { demanda } = await demandaBase();
    const enviado = await enviar(cookie, demanda.id, PDF).expect(201);
    for (const arquivo of arquivosNoDisco()) fs.rmSync(path.join(pastaUploads(), arquivo));

    const res = await request(app).get(`/api/anexos/${enviado.body[0].id}/download`).set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('id inválido responde 404', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    await request(app).get('/api/anexos/abc/download').set('Cookie', cookie).expect(404);
    await request(app).get('/api/anexos/999999/download').set('Cookie', cookie).expect(404);
  });
});

describe('POST /api/demandas com arquivos (formulário multipart)', () => {
  it('cria a demanda e os anexos juntos', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();

    const res = await request(app)
      .post('/api/demandas')
      .set('Cookie', cookie)
      .field('demandanteId', String(demandante.id))
      .field('assunto', 'Com anexos')
      .field('prazo', em(30))
      .attach('anexos', PDF, 'a.pdf')
      .attach('anexos', DOCX, 'b.docx');

    expect(res.status).toBe(201);
    const anexos = await prisma.anexo.findMany({ where: { demandaId: res.body.id } });
    expect(anexos).toHaveLength(2);
    expect(anexos.every((a) => a.enviadoPorId !== null)).toBe(true);
    expect(arquivosNoDisco()).toHaveLength(2);
  });

  it('arquivo inválido impede a criação da demanda', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();

    const res = await request(app)
      .post('/api/demandas')
      .set('Cookie', cookie)
      .field('demandanteId', String(demandante.id))
      .field('assunto', 'Com anexo ruim')
      .field('prazo', em(30))
      .attach('anexos', Buffer.from('não é pdf'), 'ruim.pdf');

    expect(res.status).toBe(400);
    expect(await prisma.demanda.count()).toBe(0);
    expect(arquivosNoDisco()).toHaveLength(0);
  });

  it('dados inválidos no formulário não deixam arquivos órfãos', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();

    const res = await request(app)
      .post('/api/demandas')
      .set('Cookie', cookie)
      .field('demandanteId', String(demandante.id))
      .field('assunto', '')
      .field('prazo', em(30))
      .attach('anexos', PDF, 'a.pdf');

    expect(res.status).toBe(400);
    expect(arquivosNoDisco()).toHaveLength(0);
  });
});
