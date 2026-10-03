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

beforeEach(limparBanco);
afterAll(() => prisma.$disconnect());

describe('acesso', () => {
  it('exige login', async () => {
    await request(app).get('/api/demandas').expect(401);
    await request(app).post('/api/demandas').send({}).expect(401);
    await request(app).get('/api/fiscais').expect(401);
  });
});

describe('POST /api/demandas', () => {
  it('gestor cria demanda planejada, já aberta', async () => {
    const { user, cookie } = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();

    const res = await request(app)
      .post('/api/demandas')
      .set('Cookie', cookie)
      .send({ demandanteId: demandante.id, assunto: 'Vistoria na empresa X', prazo: em(30) });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'aberta',
      origem: 'planejada',
      assunto: 'Vistoria na empresa X',
      prazo: em(30),
      fiscal: null,
    });
    expect(res.body.numero).toMatch(/^DEM-\d{4}$/);

    const salva = await prisma.demanda.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(salva.criadaPorId).toBe(user.id);
  });

  it('aceita ids em texto, como vêm de um formulário', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();
    const fiscal = await criarFiscal();

    const res = await request(app).post('/api/demandas').set('Cookie', cookie).send({
      demandanteId: String(demandante.id),
      fiscalId: String(fiscal.id),
      assunto: 'Denúncia',
      prazo: em(10),
    });
    expect(res.status).toBe(201);
    expect(res.body.fiscalId).toBe(fiscal.id);
  });

  it('inspetor abre demanda de campo: fica em análise e o fiscal é ele mesmo', async () => {
    const { user, cookie } = await criarUsuarioComSessao('inspetor');
    const meuFiscal = await criarFiscal('Meu Fiscal', user.id);
    const outroFiscal = await criarFiscal('Outro Fiscal');
    const demandante = await criarDemandante();

    const res = await request(app).post('/api/demandas').set('Cookie', cookie).send({
      demandanteId: demandante.id,
      assunto: 'Acidente grave em obra',
      prazo: em(2),
      fiscalId: outroFiscal.id,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'em_analise', origem: 'campo', fiscalId: meuFiscal.id });
  });

  it('inspetor sem fiscal vinculado não consegue criar', async () => {
    const { cookie } = await criarUsuarioComSessao('inspetor');
    const demandante = await criarDemandante();
    const res = await request(app)
      .post('/api/demandas')
      .set('Cookie', cookie)
      .send({ demandanteId: demandante.id, assunto: 'x', prazo: em(5) });
    expect(res.status).toBe(403);
    expect(res.body.erro).toMatch(/vinculado a um fiscal/);
  });

  it('representante não cria demandas', async () => {
    const demandante = await criarDemandante();
    const { cookie } = await criarUsuarioComSessao('representante', { demandanteId: demandante.id });
    const res = await request(app)
      .post('/api/demandas')
      .set('Cookie', cookie)
      .send({ demandanteId: demandante.id, assunto: 'x', prazo: em(5) });
    expect(res.status).toBe(403);
  });

  it('rejeita ids que não existem (ponto 2 da revisão)', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();

    const semDemandante = await request(app)
      .post('/api/demandas')
      .set('Cookie', cookie)
      .send({ demandanteId: 999999, assunto: 'x', prazo: em(5) });
    expect(semDemandante.status).toBe(400);
    expect(semDemandante.body.erro).toBe('Demandante não encontrado.');

    const semFiscal = await request(app)
      .post('/api/demandas')
      .set('Cookie', cookie)
      .send({ demandanteId: demandante.id, fiscalId: 999999, assunto: 'x', prazo: em(5) });
    expect(semFiscal.status).toBe(400);
    expect(semFiscal.body.erro).toBe('Fiscal não encontrado.');
  });

  it.each([
    ['sem assunto', { assunto: '  ' }, 'Preencha demandante, assunto e prazo.'],
    ['sem prazo', { prazo: undefined }, 'Preencha demandante, assunto e prazo.'],
    ['prazo inexistente', { prazo: '2026-02-30' }, 'Informe um prazo válido (AAAA-MM-DD).'],
    ['prazo em outro formato', { prazo: '03/10/2026' }, 'Informe um prazo válido (AAAA-MM-DD).'],
    ['demandante em texto não numérico', { demandanteId: 'abc' }, 'Demandante inválido.'],
  ])('rejeita demanda %s', async (_nome, alteracao, mensagem) => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();
    const res = await request(app)
      .post('/api/demandas')
      .set('Cookie', cookie)
      .send({ demandanteId: demandante.id, assunto: 'Assunto', prazo: em(5), ...alteracao });
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe(mensagem);
  });
});

describe('GET /api/demandas — escopo por perfil', () => {
  async function cenario() {
    const orgaoA = await criarDemandante('Órgão A');
    const orgaoB = await criarDemandante('Órgão B');
    const inspetor = await criarUsuarioComSessao('inspetor');
    const fiscalDoInspetor = await criarFiscal('Fiscal Inspetor', inspetor.user.id);
    const outroFiscal = await criarFiscal('Outro Fiscal');

    const base = { prazo: data(em(30)), status: 'aberta' as const };
    await criarDemanda({ ...base, demandanteId: orgaoA.id, fiscalId: fiscalDoInspetor.id, assunto: 'A do inspetor' });
    await criarDemanda({ ...base, demandanteId: orgaoA.id, fiscalId: outroFiscal.id, assunto: 'A de outro' });
    await criarDemanda({ ...base, demandanteId: orgaoB.id, fiscalId: outroFiscal.id, assunto: 'B de outro' });
    await criarDemanda({ ...base, demandanteId: orgaoA.id, status: 'em_analise', assunto: 'A em análise' });

    return { orgaoA, inspetor };
  }

  const assuntos = (corpo: { assunto: string }[]) => corpo.map((d) => d.assunto).sort();

  it('gestor vê tudo', async () => {
    await cenario();
    const { cookie } = await criarUsuarioComSessao('gestor');
    const res = await request(app).get('/api/demandas').set('Cookie', cookie).expect(200);
    expect(res.body).toHaveLength(4);
  });

  it('inspetor vê só as suas', async () => {
    const { inspetor } = await cenario();
    const res = await request(app).get('/api/demandas').set('Cookie', inspetor.cookie).expect(200);
    expect(assuntos(res.body)).toEqual(['A do inspetor']);
  });

  it('inspetor sem fiscal vinculado não vê nada', async () => {
    await cenario();
    const { cookie } = await criarUsuarioComSessao('inspetor');
    const res = await request(app).get('/api/demandas').set('Cookie', cookie).expect(200);
    expect(res.body).toEqual([]);
  });

  it('representante vê só o órgão dele e nunca o que está em análise', async () => {
    const { orgaoA } = await cenario();
    const { cookie } = await criarUsuarioComSessao('representante', { demandanteId: orgaoA.id });
    const res = await request(app).get('/api/demandas').set('Cookie', cookie).expect(200);
    expect(assuntos(res.body)).toEqual(['A de outro', 'A do inspetor']);
  });

  it('o escopo vale também junto com filtros: inspetor não "escapa" por busca', async () => {
    const { inspetor } = await cenario();
    const res = await request(app).get('/api/demandas').query({ busca: 'outro' }).set('Cookie', inspetor.cookie);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/demandas — filtros em SQL (ponto 5 da revisão)', () => {
  async function cenarioPrazos() {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante('Sindicato Alfa');
    const fiscal = await criarFiscal('Carla Fiscal');
    const nova = (assunto: string, dias: number, extra = {}) =>
      criarDemanda({ demandanteId: demandante.id, assunto, prazo: data(em(dias)), ...extra });

    const vencida = await nova('vencida', -2);
    await nova('critica-hoje', 0);
    await nova('critica-limite', 5);
    await nova('futura', 6);
    await nova('concluida-antiga', -10, { status: 'concluida' });
    await nova('em-andamento-futura', 40, { status: 'em_andamento', fiscalId: fiscal.id });
    await nova('em-analise-vencida', -1, { status: 'em_analise' });
    return { cookie, fiscal, vencida };
  }

  const listar = async (cookie: string, query: Record<string, string> = {}) => {
    const res = await request(app).get('/api/demandas').query(query).set('Cookie', cookie);
    return { status: res.status, corpo: res.body, assuntos: (res.body as { assunto: string }[]).map?.((d) => d.assunto) };
  };

  it('ordena por prazo', async () => {
    const { cookie } = await cenarioPrazos();
    const { assuntos } = await listar(cookie);
    expect(assuntos).toEqual([
      'concluida-antiga',
      'vencida',
      'em-analise-vencida',
      'critica-hoje',
      'critica-limite',
      'futura',
      'em-andamento-futura',
    ]);
  });

  it.each([
    ['vencida', ['vencida']],
    ['prazo_critico', ['critica-hoje', 'critica-limite']],
    ['aberta', ['futura']],
    ['em_andamento', ['em-andamento-futura']],
    ['concluida', ['concluida-antiga']],
    ['em_analise', ['em-analise-vencida']],
  ])('filtra por status %s', async (status, esperado) => {
    const { cookie } = await cenarioPrazos();
    const { assuntos } = await listar(cookie, { status });
    expect(assuntos).toEqual(esperado);
  });

  it('o status devolvido bate com o filtro usado', async () => {
    const { cookie } = await cenarioPrazos();
    for (const status of ['vencida', 'prazo_critico', 'aberta', 'em_andamento', 'concluida', 'em_analise']) {
      const { corpo } = await listar(cookie, { status });
      for (const demanda of corpo) expect(demanda.status).toBe(status);
    }
  });

  it('filtra por período de prazo', async () => {
    const { cookie } = await cenarioPrazos();
    const { assuntos } = await listar(cookie, { de: em(0), ate: em(5) });
    expect(assuntos).toEqual(['critica-hoje', 'critica-limite']);
  });

  it('filtra por fiscal', async () => {
    const { cookie, fiscal } = await cenarioPrazos();
    const { assuntos } = await listar(cookie, { fiscalId: String(fiscal.id) });
    expect(assuntos).toEqual(['em-andamento-futura']);
  });

  it('busca por assunto, demandante, fiscal e número, sem diferenciar maiúsculas', async () => {
    const { cookie, vencida } = await cenarioPrazos();
    expect((await listar(cookie, { busca: 'VENCIDA' })).assuntos).toContain('vencida');
    expect((await listar(cookie, { busca: 'alfa' })).corpo).toHaveLength(7);
    expect((await listar(cookie, { busca: 'carla' })).assuntos).toEqual(['em-andamento-futura']);
    const numero = `DEM-${String(vencida.id).padStart(4, '0')}`;
    expect((await listar(cookie, { busca: numero.toLowerCase() })).assuntos).toEqual(['vencida']);
  });

  it('ignora filtros vazios, como os enviados por formulários', async () => {
    const { cookie } = await cenarioPrazos();
    const { corpo } = await listar(cookie, { de: '', ate: '', status: '', busca: '', fiscalId: '' });
    expect(corpo).toHaveLength(7);
  });

  it('devolve o status salvo além do status de exibição (vencida não esconde "em andamento")', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();
    await criarDemanda({
      demandanteId: demandante.id, assunto: 'x', prazo: data(em(-3)), status: 'em_andamento',
    });

    const res = await request(app).get('/api/demandas').set('Cookie', cookie).expect(200);
    expect(res.body[0]).toMatchObject({ status: 'vencida', statusSalvo: 'em_andamento' });
  });

  it('"ativas" traz só abertas e em andamento (sem concluídas nem em análise)', async () => {
    const { cookie } = await cenarioPrazos();
    const { assuntos } = await listar(cookie, { ativas: 'true' });
    expect(assuntos).toEqual(['vencida', 'critica-hoje', 'critica-limite', 'futura', 'em-andamento-futura']);
  });

  it('"ativas" combina com o período, como a lista de prazos usa', async () => {
    const { cookie } = await cenarioPrazos();
    const { assuntos } = await listar(cookie, { ativas: 'true', ate: em(30) });
    expect(assuntos).toEqual(['vencida', 'critica-hoje', 'critica-limite', 'futura']);
  });

  it('ordena pelas mais recentes e limita a quantidade', async () => {
    const { cookie } = await cenarioPrazos();
    const { assuntos } = await listar(cookie, { ordenar: 'recentes', limite: '2' });
    expect(assuntos).toEqual(['em-analise-vencida', 'em-andamento-futura']);
  });

  it('rejeita filtros inválidos com 400', async () => {
    const { cookie } = await cenarioPrazos();
    expect((await listar(cookie, { status: 'inventado' })).status).toBe(400);
    expect((await listar(cookie, { de: '31/12/2026' })).status).toBe(400);
    expect((await listar(cookie, { fiscalId: 'abc' })).status).toBe(400);
    expect((await listar(cookie, { limite: '0' })).status).toBe(400);
    expect((await listar(cookie, { limite: '501' })).status).toBe(400);
    expect((await listar(cookie, { ordenar: 'aleatorio' })).status).toBe(400);
    expect((await listar(cookie, { ativas: 'talvez' })).status).toBe(400);
  });
});

describe('PATCH /api/demandas/:id', () => {
  it('gestor altera status e reatribui o fiscal', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();
    const fiscal = await criarFiscal();
    const demanda = await criarDemanda({ demandanteId: demandante.id, assunto: 'x', prazo: data(em(30)) });

    const res = await request(app)
      .patch(`/api/demandas/${demanda.id}`)
      .set('Cookie', cookie)
      .send({ status: 'em_andamento', fiscalId: fiscal.id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'em_andamento', fiscalId: fiscal.id });
  });

  it('aceita fiscalId vazio ou null para desatribuir', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();
    const fiscal = await criarFiscal();
    const demanda = await criarDemanda({ demandanteId: demandante.id, fiscalId: fiscal.id, assunto: 'x', prazo: data(em(30)) });

    const res = await request(app).patch(`/api/demandas/${demanda.id}`).set('Cookie', cookie).send({ fiscalId: '' });
    expect(res.status).toBe(200);
    expect(res.body.fiscalId).toBeNull();
  });

  it('registra a data de conclusão e limpa ao reabrir', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();
    const demanda = await criarDemanda({ demandanteId: demandante.id, assunto: 'x', prazo: data(em(30)) });

    await request(app).patch(`/api/demandas/${demanda.id}`).set('Cookie', cookie).send({ status: 'concluida' }).expect(200);
    const concluida = await prisma.demanda.findUniqueOrThrow({ where: { id: demanda.id } });
    expect(concluida.concluidaEm).not.toBeNull();

    // editar outro campo não mexe na data de conclusão
    await request(app).patch(`/api/demandas/${demanda.id}`).set('Cookie', cookie).send({ assunto: 'novo assunto' }).expect(200);
    const aposEditar = await prisma.demanda.findUniqueOrThrow({ where: { id: demanda.id } });
    expect(aposEditar.concluidaEm).toEqual(concluida.concluidaEm);

    await request(app).patch(`/api/demandas/${demanda.id}`).set('Cookie', cookie).send({ status: 'aberta', motivo: 'Faltou anexar o laudo' }).expect(200);
    const reaberta = await prisma.demanda.findUniqueOrThrow({ where: { id: demanda.id } });
    expect(reaberta.concluidaEm).toBeNull();
  });

  it('valida o corpo: status inválido, fiscal inexistente, corpo vazio, id inválido', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();
    const demanda = await criarDemanda({ demandanteId: demandante.id, assunto: 'x', prazo: data(em(30)) });
    const patch = (id: string | number, corpo: object) =>
      request(app).patch(`/api/demandas/${id}`).set('Cookie', cookie).send(corpo);

    expect((await patch(demanda.id, { status: 'em_analise' })).status).toBe(400);
    expect((await patch(demanda.id, { status: 'qualquer' })).body.erro).toBe('Status inválido.');
    expect((await patch(demanda.id, { fiscalId: 999999 })).body.erro).toBe('Fiscal não encontrado.');
    expect((await patch(demanda.id, {})).body.erro).toBe('Nada para atualizar.');
    expect((await patch('abc', { status: 'aberta' })).status).toBe(404);
    expect((await patch(999999, { status: 'aberta' })).status).toBe(404);
  });

  it('inspetor altera o status da própria demanda, mas não o fiscal, o prazo nem o assunto', async () => {
    const { user, cookie } = await criarUsuarioComSessao('inspetor');
    const meuFiscal = await criarFiscal('Meu', user.id);
    const demandante = await criarDemandante();
    const demanda = await criarDemanda({ demandanteId: demandante.id, fiscalId: meuFiscal.id, assunto: 'x', prazo: data(em(30)) });
    const patch = (corpo: object) => request(app).patch(`/api/demandas/${demanda.id}`).set('Cookie', cookie).send(corpo);

    expect((await patch({ status: 'em_andamento' })).status).toBe(200);
    expect((await patch({ fiscalId: null })).status).toBe(403);
    expect((await patch({ prazo: em(60) })).status).toBe(403);
    expect((await patch({ assunto: 'outro' })).status).toBe(403);
  });

  it('inspetor não enxerga nem altera demanda de outro fiscal (404, sem vazar que existe)', async () => {
    const { user, cookie } = await criarUsuarioComSessao('inspetor');
    await criarFiscal('Meu', user.id);
    const outro = await criarFiscal('Outro');
    const demandante = await criarDemandante();
    const alheia = await criarDemanda({ demandanteId: demandante.id, fiscalId: outro.id, assunto: 'x', prazo: data(em(30)) });

    const res = await request(app).patch(`/api/demandas/${alheia.id}`).set('Cookie', cookie).send({ status: 'concluida' });
    expect(res.status).toBe(404);
    expect((await prisma.demanda.findUniqueOrThrow({ where: { id: alheia.id } })).status).toBe('aberta');
  });

  it('demanda em análise não pode ser alterada: inspetor recebe 403 e gestor, 409', async () => {
    const inspetor = await criarUsuarioComSessao('inspetor');
    const meuFiscal = await criarFiscal('Meu', inspetor.user.id);
    const gestor = await criarUsuarioComSessao('gestor');
    const demandante = await criarDemandante();
    const demanda = await criarDemanda({
      demandanteId: demandante.id, fiscalId: meuFiscal.id, assunto: 'x', prazo: data(em(30)), status: 'em_analise', origem: 'campo',
    });

    const doInspetor = await request(app).patch(`/api/demandas/${demanda.id}`).set('Cookie', inspetor.cookie).send({ status: 'concluida' });
    expect(doInspetor.status).toBe(403);
    const doGestor = await request(app).patch(`/api/demandas/${demanda.id}`).set('Cookie', gestor.cookie).send({ status: 'concluida' });
    expect(doGestor.status).toBe(409);
  });

  it('representante não altera nada', async () => {
    const demandante = await criarDemandante();
    const { cookie } = await criarUsuarioComSessao('representante', { demandanteId: demandante.id });
    const demanda = await criarDemanda({ demandanteId: demandante.id, assunto: 'x', prazo: data(em(30)) });
    const res = await request(app).patch(`/api/demandas/${demanda.id}`).set('Cookie', cookie).send({ status: 'concluida' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/demandas/:id/validar', () => {
  async function demandaDeCampo() {
    const inspetor = await criarUsuarioComSessao('inspetor');
    const fiscal = await criarFiscal('Do campo', inspetor.user.id);
    const demandante = await criarDemandante();
    const demanda = await criarDemanda({
      demandanteId: demandante.id, fiscalId: fiscal.id, assunto: 'Denúncia', prazo: data(em(3)),
      status: 'em_analise', origem: 'campo', criadaPorId: inspetor.user.id,
    });
    return { inspetor, fiscal, demanda };
  }

  it('gestor valida: vira aberta e registra quem validou e quando', async () => {
    const { demanda } = await demandaDeCampo();
    const gestor = await criarUsuarioComSessao('gestor');

    const res = await request(app).post(`/api/demandas/${demanda.id}/validar`).set('Cookie', gestor.cookie).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('prazo_critico'); // aberta, mas com prazo em 3 dias
    expect(res.body.validadaEm).not.toBeNull();

    const salva = await prisma.demanda.findUniqueOrThrow({ where: { id: demanda.id } });
    expect(salva.status).toBe('aberta');
    expect(salva.validadaPorId).toBe(gestor.user.id);
  });

  it('gestor pode ajustar fiscal e prazo ao validar', async () => {
    const { demanda } = await demandaDeCampo();
    const gestor = await criarUsuarioComSessao('gestor');
    const outro = await criarFiscal('Outro');

    const res = await request(app)
      .post(`/api/demandas/${demanda.id}/validar`)
      .set('Cookie', gestor.cookie)
      .send({ fiscalId: outro.id, prazo: em(45) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'aberta', fiscalId: outro.id, prazo: em(45) });
  });

  it('validar duas vezes responde 409', async () => {
    const { demanda } = await demandaDeCampo();
    const gestor = await criarUsuarioComSessao('gestor');
    await request(app).post(`/api/demandas/${demanda.id}/validar`).set('Cookie', gestor.cookie).send({}).expect(200);
    await request(app).post(`/api/demandas/${demanda.id}/validar`).set('Cookie', gestor.cookie).send({}).expect(409);
  });

  it('só o gestor valida', async () => {
    const { inspetor, demanda } = await demandaDeCampo();
    await request(app).post(`/api/demandas/${demanda.id}/validar`).set('Cookie', inspetor.cookie).send({}).expect(403);
    expect((await prisma.demanda.findUniqueOrThrow({ where: { id: demanda.id } })).status).toBe('em_analise');
  });

  it('demanda inexistente responde 404', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    await request(app).post('/api/demandas/999999/validar').set('Cookie', gestor.cookie).send({}).expect(404);
  });
});

describe('fiscais e demandantes', () => {
  it('só o gestor lista e cria fiscais; a carga conta só demandas não concluídas', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const inspetor = await criarUsuarioComSessao('inspetor');
    const fiscal = await criarFiscal('Fiscal Carga');
    const demandante = await criarDemandante();
    const base = { demandanteId: demandante.id, fiscalId: fiscal.id, assunto: 'x', prazo: data(em(30)) };
    await criarDemanda({ ...base, status: 'aberta' });
    await criarDemanda({ ...base, status: 'em_andamento' });
    await criarDemanda({ ...base, status: 'concluida' });

    await request(app).get('/api/fiscais').set('Cookie', inspetor.cookie).expect(403);
    await request(app).post('/api/fiscais').set('Cookie', inspetor.cookie).send({ nome: 'X' }).expect(403);

    const lista = await request(app).get('/api/fiscais').set('Cookie', gestor.cookie).expect(200);
    expect(lista.body).toEqual([
      { id: fiscal.id, nome: 'Fiscal Carga', especialidade: null, usuarioId: null, demandas_ativas: 2 },
    ]);

    const criado = await request(app).post('/api/fiscais').set('Cookie', gestor.cookie).send({ nome: ' Novo ', especialidade: '' });
    expect(criado.status).toBe(201);
    expect(criado.body).toMatchObject({ nome: 'Novo', especialidade: null, demandas_ativas: 0 });

    const semNome = await request(app).post('/api/fiscais').set('Cookie', gestor.cookie).send({ nome: '   ' });
    expect(semNome.status).toBe(400);
    expect(semNome.body.erro).toBe('Informe o nome do fiscal.');
  });

  it('gestor e inspetor listam demandantes; representante não', async () => {
    const demandante = await criarDemandante('Órgão Lista', 'saude');
    const gestor = await criarUsuarioComSessao('gestor');
    const inspetor = await criarUsuarioComSessao('inspetor');
    const representante = await criarUsuarioComSessao('representante', { demandanteId: demandante.id });

    const res = await request(app).get('/api/demandantes').set('Cookie', inspetor.cookie).expect(200);
    expect(res.body).toEqual([{ id: demandante.id, nome: 'Órgão Lista', tipo: 'saude', tipoRotulo: 'Serviços de saúde' }]);
    await request(app).get('/api/demandantes').set('Cookie', gestor.cookie).expect(200);
    await request(app).get('/api/demandantes').set('Cookie', representante.cookie).expect(403);
  });

  it('cria demandante como "outro" e recusa nome repetido', async () => {
    const { cookie } = await criarUsuarioComSessao('inspetor');
    const criado = await request(app).post('/api/demandantes').set('Cookie', cookie).send({ nome: '  Órgão Novo ' });
    expect(criado.status).toBe(201);
    expect(criado.body).toMatchObject({ nome: 'Órgão Novo', tipo: 'outro' });

    const repetido = await request(app).post('/api/demandantes').set('Cookie', cookie).send({ nome: 'Órgão Novo' });
    expect(repetido.status).toBe(409);
  });
});
