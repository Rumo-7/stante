import request from 'supertest';
import { adicionarDias, DIAS_PRAZO_PADRAO, hojeNoFuso } from '@stante/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { criarDemanda, criarDemandante, criarFiscal, criarUsuarioComSessao, data, limparBanco } from '../../test/fixtures';

const app = createApp();

beforeEach(limparBanco);
afterAll(() => prisma.$disconnect());

const hoje = () => hojeNoFuso();
/** "AAAA-MM-DD" -> "dd/mm/aaaa", como vem da planilha */
const br = (iso: string) => iso.split('-').reverse().join('/');

const CABECALHO = 'Processo SEI;Data de recebimento;Órgão demandante;Assunto;Prazo;Responsável;Situação';

const enviar = (rota: string, cookie: string, csv: string, nome = 'demandas.csv') =>
  request(app).post(rota).set('Cookie', cookie).attach('arquivo', Buffer.from(csv, 'utf-8'), nome);

async function cenario() {
  const { user, cookie } = await criarUsuarioComSessao('gestor');
  const mpt = await criarDemandante('Ministério Público do Trabalho (MPT)');
  const fiscalUser = await criarUsuarioComSessao('inspetor');
  const fiscal = await criarFiscal('Carlos Melo', fiscalUser.user.id);
  const recebida = adicionarDias(hoje(), -10);
  const csv = [
    CABECALHO,
    `25000.000001/2026-11;${br(recebida)};MPT;Inspeção em frigorífico;;Carlos Melo;Em andamento`,
    `25000.000002/2026-11;${br(recebida)};PRT 6ª Região;Órgão que não existe;;;`,
    '',
  ].join('\r\n');
  return { user, cookie, mpt, fiscal, fiscalUser: fiscalUser.user, recebida, csv };
}

describe('acesso', () => {
  it('exige login e só o gestor importa', async () => {
    await request(app).post('/api/demandas/importacao/previa').expect(401);
    const { cookie } = await criarUsuarioComSessao('inspetor');
    await enviar('/api/demandas/importacao/previa', cookie, CABECALHO).expect(403);
    await enviar('/api/demandas/importacao', cookie, CABECALHO).expect(403);
  });
});

describe('POST /api/demandas/importacao/previa', () => {
  it('mostra o que seria importado, linha a linha, sem gravar nada', async () => {
    const { cookie, csv } = await cenario();

    const res = await enviar('/api/demandas/importacao/previa', cookie, csv).expect(200);

    expect(res.body.totais).toEqual({ validas: 1, comErro: 1 });
    expect(res.body.linhas[0]).toMatchObject({
      linha: 2,
      erros: [],
      demandante: 'Ministério Público do Trabalho (MPT)',
      fiscal: 'Carlos Melo',
    });
    expect(res.body.linhas[1].erros[0]).toMatch(/PRT 6ª Região" não está cadastrado/);
    expect(res.body.colunas.ignoradas).toEqual([]);
    expect(await prisma.demanda.count()).toBe(0);
  });

  it('recusa arquivo que não é CSV e planilha sem as colunas obrigatórias', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const semArquivo = await request(app).post('/api/demandas/importacao/previa').set('Cookie', cookie).expect(400);
    expect(semArquivo.body.erro).toBe('Selecione o arquivo CSV.');

    const pdf = await enviar('/api/demandas/importacao/previa', cookie, 'x', 'oficio.pdf').expect(400);
    expect(pdf.body.erro).toMatch(/precisa ser \.csv/);

    const semColunas = await enviar('/api/demandas/importacao/previa', cookie, 'Processo;Prazo\n1;').expect(400);
    expect(semColunas.body.erro).toMatch(/Órgão demandante/);
  });
});

describe('POST /api/demandas/importacao', () => {
  it('cria só as linhas válidas, com processo, recebimento, histórico e aviso ao fiscal', async () => {
    const { user, cookie, mpt, fiscal, fiscalUser, recebida, csv } = await cenario();

    const res = await enviar('/api/demandas/importacao', cookie, csv).expect(201);
    expect(res.body.criadas).toBe(1);

    const [demanda] = await prisma.demanda.findMany({ include: { historico: true } });
    expect(demanda).toMatchObject({
      demandanteId: mpt.id,
      fiscalId: fiscal.id,
      processoSei: '25000.000001/2026-11',
      recebidaEm: data(recebida),
      // Sem prazo na planilha: padrão contado a partir do recebimento
      prazo: data(adicionarDias(recebida, DIAS_PRAZO_PADRAO)),
      status: 'em_andamento',
      origem: 'planejada',
      criadaPorId: user.id,
    });
    expect(demanda!.historico).toHaveLength(1);
    expect(demanda!.historico[0]).toMatchObject({ tipo: 'criada', dados: { importada: true } });

    const avisos = await prisma.notificacao.findMany({ where: { userId: fiscalUser.id } });
    expect(avisos.map((a) => a.tipo)).toEqual(['demanda_atribuida']);

    // O histórico conta de onde ela veio
    const historico = await request(app).get(`/api/demandas/${demanda!.id}/historico`).set('Cookie', cookie).expect(200);
    expect(historico.body[0].descricao).toBe('Demanda importada da planilha (processo SEI 25000.000001/2026-11)');
  });

  it('importar a mesma planilha de novo não duplica: o processo já existe', async () => {
    const { cookie, csv } = await cenario();
    await enviar('/api/demandas/importacao', cookie, csv).expect(201);

    const res = await enviar('/api/demandas/importacao', cookie, csv).expect(400);
    expect(res.body.erro).toMatch(/Nenhuma linha válida/);
    expect(await prisma.demanda.count()).toBe(1);
  });

  it('a busca da lista de demandas encontra pelo processo SEI', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const orgao = await criarDemandante();
    await criarDemanda({ demandanteId: orgao.id, assunto: 'Com processo', prazo: data(hoje()), processoSei: '25000.999999/2026-01' });
    await criarDemanda({ demandanteId: orgao.id, assunto: 'Sem processo', prazo: data(hoje()) });

    const res = await request(app).get('/api/demandas?busca=999999').set('Cookie', cookie).expect(200);
    expect(res.body.map((d: { assunto: string }) => d.assunto)).toEqual(['Com processo']);
    expect(res.body[0]).toMatchObject({ processoSei: '25000.999999/2026-01', recebidaEm: null });
  });
});
