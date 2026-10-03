import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';
import {
  criarDemanda,
  criarDemandante,
  criarUsuarioComSessao,
  data,
  limparBanco,
} from '../../test/fixtures';
import { agregarPorOrgao, mediana, type DemandaBase, type OrgaoBase } from './estatisticas';

const FUSO = 'America/Recife';
const HOJE = '2026-10-10';

const orgao = (id: number, nome: string): OrgaoBase => ({ id, nome, tipo: 'outro' });

/** Datas em horário de Recife (UTC-3). */
const em = (iso: string, hora = '12:00') => new Date(`${iso}T${hora}:00-03:00`);

function demanda(
  demandanteId: number,
  status: DemandaBase['status'],
  prazo: string,
  cadastro: string,
  concluidaEm: Date | null = null,
): DemandaBase {
  return { demandanteId, status, prazo: data(prazo), createdAt: em(cadastro), concluidaEm };
}

const calcular = (orgaos: OrgaoBase[], demandas: DemandaBase[]) => agregarPorOrgao(orgaos, demandas, HOJE, FUSO);
const doOrgao = (resultado: ReturnType<typeof calcular>, id: number) =>
  resultado.orgaos.find((o) => o.id === id)!;

describe('mediana', () => {
  it('ímpar, par e vazio', () => {
    expect(mediana([2, 4, 10])).toBe(4);
    expect(mediana([2, 4])).toBe(3);
    expect(mediana([7])).toBe(7);
    expect(mediana([])).toBeNull();
  });

  it('não depende da ordem e resiste a um valor extremo (ao contrário da média)', () => {
    expect(mediana([30, 2, 3, 4, 2])).toBe(3); // a média seria 8,2
  });

  it('arredonda para uma casa decimal', () => {
    expect(mediana([1, 2])).toBe(1.5);
    expect(mediana([1.04, 1.09, 9])).toBe(1.1);
  });
});

describe('agregarPorOrgao', () => {
  it('conta recebidas, concluídas, no prazo, fora do prazo, em aberto e vencidas', () => {
    const resultado = calcular(
      [orgao(1, 'Órgão A')],
      [
        demanda(1, 'concluida', '2026-09-20', '2026-09-01', em('2026-09-15')), // no prazo, 14 dias
        demanda(1, 'concluida', '2026-09-10', '2026-09-01', em('2026-09-20')), // fora do prazo, 19 dias
        demanda(1, 'aberta', '2026-10-01', '2026-09-05'), // vencida
        demanda(1, 'em_andamento', '2026-10-30', '2026-10-01'), // em aberto, em dia
      ],
    );

    expect(doOrgao(resultado, 1)).toMatchObject({
      recebidas: 4,
      concluidas: 2,
      noPrazo: 1,
      foraDoPrazo: 1,
      emAberto: 2,
      vencidas: 1,
      taxaConclusao: 0.5,
      medianaDias: 16.5,
    });
  });

  it('pontualidade conta a vencida sem resposta contra o órgão', () => {
    const resultado = calcular(
      [orgao(1, 'Órgão A')],
      [
        demanda(1, 'concluida', '2026-09-20', '2026-09-01', em('2026-09-15')),
        demanda(1, 'concluida', '2026-09-10', '2026-09-01', em('2026-09-20')),
        demanda(1, 'aberta', '2026-10-01', '2026-09-05'),
      ],
    );
    // 1 no prazo em (1 no prazo + 1 fora + 1 vencida)
    expect(doOrgao(resultado, 1).pontualidade).toBe(0.333);
  });

  it('o prazo vai até o fim do dia, no fuso de Recife', () => {
    const noUltimoMinuto = calcular(
      [orgao(1, 'A')],
      [demanda(1, 'concluida', '2026-09-20', '2026-09-01', em('2026-09-20', '23:59'))],
    );
    const meiaNoiteEMeia = calcular(
      [orgao(1, 'A')],
      [demanda(1, 'concluida', '2026-09-20', '2026-09-01', em('2026-09-21', '00:30'))],
    );

    expect(doOrgao(noUltimoMinuto, 1)).toMatchObject({ noPrazo: 1, foraDoPrazo: 0 });
    expect(doOrgao(meiaNoiteEMeia, 1)).toMatchObject({ noPrazo: 0, foraDoPrazo: 1 });
  });

  it('o dia do cadastro também é o de Recife: às 22h30 ainda é o mesmo dia', () => {
    // Cadastrada às 22h30 do dia 01 (01h30 do dia 02 em UTC), prazo no dia 11: foram concedidos 10 dias.
    // Contando em UTC seriam 9, e o indicador do órgão sairia errado.
    const tardeDaNoite = { ...demanda(1, 'aberta', '2026-09-11', '2026-09-01'), createdAt: em('2026-09-01', '22:30') };
    const resultado = calcular([orgao(1, 'A')], [tardeDaNoite]);
    expect(doOrgao(resultado, 1).prazoConcedidoMedianoDias).toBe(10);
  });

  it('o prazo concedido é a mediana dos dias entre o cadastro e o prazo', () => {
    const resultado = calcular(
      [orgao(1, 'A')],
      [
        demanda(1, 'aberta', '2026-10-20', '2026-10-01'), // 19
        demanda(1, 'aberta', '2026-10-10', '2026-10-01'), // 9
        demanda(1, 'aberta', '2026-10-27', '2026-10-01'), // 26
        demanda(1, 'aberta', '2026-10-30', '2026-10-01'), // 29
      ],
    );
    expect(doOrgao(resultado, 1).prazoConcedidoMedianoDias).toBe(22.5);
  });

  it('cadastro retroativo (prazo já passado na entrada) não entra no prazo concedido', () => {
    const resultado = calcular([orgao(1, 'A')], [demanda(1, 'aberta', '2026-08-01', '2026-09-01')]);
    expect(doOrgao(resultado, 1).prazoConcedidoMedianoDias).toBeNull();
    expect(doOrgao(resultado, 1).recebidas).toBe(1);
  });

  it('concluída sem data de conclusão conta como concluída, mas fica fora de prazo e tempo', () => {
    const resultado = calcular([orgao(1, 'A')], [demanda(1, 'concluida', '2026-09-20', '2026-09-01', null)]);
    expect(doOrgao(resultado, 1)).toMatchObject({
      concluidas: 1,
      noPrazo: 0,
      foraDoPrazo: 0,
      medianaDias: null,
      pontualidade: null,
    });
  });

  it('órgão sem demandas aparece, com zeros e sem taxas inventadas', () => {
    const resultado = calcular([orgao(1, 'Com demanda'), orgao(2, 'Sem demanda')], [demanda(1, 'aberta', '2026-10-30', '2026-10-01')]);
    expect(doOrgao(resultado, 2)).toMatchObject({
      recebidas: 0,
      concluidas: 0,
      emAberto: 0,
      vencidas: 0,
      taxaConclusao: null,
      pontualidade: null,
      medianaDias: null,
      prazoConcedidoMedianoDias: null,
    });
  });

  it('ordena por quantidade recebida e desempata pelo nome', () => {
    const resultado = calcular(
      [orgao(1, 'Zeta'), orgao(2, 'Ágata'), orgao(3, 'Beta'), orgao(4, 'Vazio')],
      [
        demanda(1, 'aberta', '2026-10-30', '2026-10-01'),
        demanda(2, 'aberta', '2026-10-30', '2026-10-01'),
        demanda(3, 'aberta', '2026-10-30', '2026-10-01'),
        demanda(3, 'aberta', '2026-10-30', '2026-10-01'),
      ],
    );
    expect(resultado.orgaos.map((o) => o.nome)).toEqual(['Beta', 'Ágata', 'Zeta', 'Vazio']);
  });

  it('o resumo soma todos os órgãos', () => {
    const resultado = calcular(
      [orgao(1, 'A'), orgao(2, 'B'), orgao(3, 'C')],
      [
        demanda(1, 'concluida', '2026-09-20', '2026-09-01', em('2026-09-05')), // no prazo, 4 dias
        demanda(2, 'concluida', '2026-09-10', '2026-09-01', em('2026-09-20')), // fora, 19 dias
        demanda(2, 'aberta', '2026-10-01', '2026-09-05'), // vencida
        demanda(2, 'aberta', '2026-10-30', '2026-10-01'),
      ],
    );
    expect(resultado.resumo).toEqual({
      orgaosComDemandas: 2,
      recebidas: 4,
      concluidas: 2,
      taxaConclusao: 0.5,
      pontualidade: 0.333,
      medianaDias: 11.5,
    });
  });

  it('sem demandas, o resumo não inventa taxas', () => {
    expect(calcular([orgao(1, 'A')], []).resumo).toEqual({
      orgaosComDemandas: 0,
      recebidas: 0,
      concluidas: 0,
      taxaConclusao: null,
      pontualidade: null,
      medianaDias: null,
    });
  });
});

describe('API de estatísticas e cadastro de órgãos', () => {
  const app = createApp();

  beforeEach(limparBanco);
  afterAll(() => prisma.$disconnect());

  const estatisticas = (cookie: string, consulta: Record<string, string> = {}) =>
    request(app).get('/api/demandantes/estatisticas').query(consulta).set('Cookie', cookie);

  async function nova(demandanteId: number, status: DemandaBase['status'], prazo: string, cadastro: string, concluidaEm?: Date) {
    return criarDemanda({
      demandanteId,
      assunto: 'x',
      status,
      prazo: data(prazo),
      createdAt: em(cadastro),
      concluidaEm: concluidaEm ?? null,
    });
  }

  it('exige login e é só do gestor', async () => {
    await request(app).get('/api/demandantes/estatisticas').expect(401);
    for (const perfil of ['inspetor', 'representante'] as const) {
      const { cookie } = await criarUsuarioComSessao(perfil);
      await estatisticas(cookie).expect(403);
    }
  });

  it('devolve os indicadores de cada órgão, inclusive os sem demanda, e o resumo', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const grande = await criarDemandante('Órgão Grande', 'ministerio_publico');
    const pequeno = await criarDemandante('Órgão Pequeno', 'sindicato');
    await criarDemandante('Órgão Parado', 'saude');
    await nova(grande.id, 'concluida', '2025-03-20', '2025-03-01', em('2025-03-10'));
    await nova(grande.id, 'aberta', '2025-04-01', '2025-03-05'); // vencida
    await nova(pequeno.id, 'concluida', '2025-03-10', '2025-03-01', em('2025-03-20'));

    const res = await estatisticas(gestor.cookie).expect(200);

    expect(res.body.periodo).toEqual({ de: null, ate: null });
    expect(res.body.resumo).toMatchObject({ orgaosComDemandas: 2, recebidas: 3, concluidas: 2 });
    expect(res.body.orgaos.map((o: { nome: string }) => o.nome)).toEqual(['Órgão Grande', 'Órgão Pequeno', 'Órgão Parado']);
    expect(res.body.orgaos[0]).toMatchObject({
      recebidas: 2,
      concluidas: 1,
      noPrazo: 1,
      vencidas: 1,
      emAberto: 1,
      tipo: 'ministerio_publico',
      tipoRotulo: 'Ministério Público',
    });
    expect(res.body.orgaos[2]).toMatchObject({ nome: 'Órgão Parado', recebidas: 0, taxaConclusao: null });
  });

  it('demandas em análise ainda não contam', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const orgao = await criarDemandante('Órgão');
    await nova(orgao.id, 'em_analise', '2025-04-01', '2025-03-05');
    await nova(orgao.id, 'aberta', '2025-04-01', '2025-03-05');

    const res = await estatisticas(gestor.cookie).expect(200);
    expect(res.body.orgaos[0].recebidas).toBe(1);
  });

  it('o período é o de cadastro, no dia de Recife', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    const orgao = await criarDemandante('Órgão');
    await nova(orgao.id, 'aberta', '2025-12-30', '2025-02-10');
    await nova(orgao.id, 'aberta', '2025-12-30', '2025-03-15');
    const noite = await criarDemanda({
      demandanteId: orgao.id, assunto: 'x', prazo: data('2025-12-30'), createdAt: em('2025-03-20', '22:30'),
    });
    expect(noite.id).toBeGreaterThan(0);

    const marco = await estatisticas(gestor.cookie, { de: '2025-03-01', ate: '2025-03-31' }).expect(200);
    expect(marco.body.orgaos[0].recebidas).toBe(2);
    expect(marco.body.periodo).toEqual({ de: '2025-03-01', ate: '2025-03-31' });

    const soODia20 = await estatisticas(gestor.cookie, { de: '2025-03-20', ate: '2025-03-20' }).expect(200);
    expect(soODia20.body.orgaos[0].recebidas).toBe(1); // a de 22h30 é do dia 20, não do 21
  });

  it('rejeita período inválido ou invertido', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    expect((await estatisticas(gestor.cookie, { de: '31/12/2025' })).status).toBe(400);
    const invertido = await estatisticas(gestor.cookie, { de: '2025-05-01', ate: '2025-04-01' });
    expect(invertido.status).toBe(400);
    expect(invertido.body.erro).toBe('A data inicial não pode ser depois da final.');
  });

  describe('cadastro e edição de órgãos', () => {
    it('o gestor renomeia e reclassifica', async () => {
      const gestor = await criarUsuarioComSessao('gestor');
      const orgao = await criarDemandante('Nome antigo', 'outro');

      const res = await request(app)
        .patch(`/api/demandantes/${orgao.id}`)
        .set('Cookie', gestor.cookie)
        .send({ nome: '  Nome novo ', tipo: 'judiciario' })
        .expect(200);

      expect(res.body).toEqual({ id: orgao.id, nome: 'Nome novo', tipo: 'judiciario', tipoRotulo: 'Judiciário' });
    });

    it('dá para mudar só a categoria, ou só o nome', async () => {
      const gestor = await criarUsuarioComSessao('gestor');
      const orgao = await criarDemandante('Mesmo nome', 'outro');
      const patch = (corpo: object) => request(app).patch(`/api/demandantes/${orgao.id}`).set('Cookie', gestor.cookie).send(corpo);

      expect((await patch({ tipo: 'saude' }).expect(200)).body).toMatchObject({ nome: 'Mesmo nome', tipo: 'saude' });
      expect((await patch({ nome: 'Outro nome' }).expect(200)).body).toMatchObject({ nome: 'Outro nome', tipo: 'saude' });
    });

    it('recusa nome repetido, categoria inválida, corpo vazio e órgão inexistente', async () => {
      const gestor = await criarUsuarioComSessao('gestor');
      await criarDemandante('Já existe');
      const orgao = await criarDemandante('Outro');
      const patch = (id: number | string, corpo: object) =>
        request(app).patch(`/api/demandantes/${id}`).set('Cookie', gestor.cookie).send(corpo);

      expect((await patch(orgao.id, { nome: 'Já existe' })).status).toBe(409);
      const categoria = await patch(orgao.id, { tipo: 'inventada' });
      expect(categoria.status).toBe(400);
      expect(categoria.body.erro).toBe('Categoria inválida.');
      expect((await patch(orgao.id, {})).body.erro).toBe('Nada para atualizar.');
      expect((await patch(999999, { nome: 'X' })).status).toBe(404);
      expect((await patch('abc', { nome: 'X' })).status).toBe(404);
    });

    it('só o gestor edita', async () => {
      const orgao = await criarDemandante('Órgão', 'outro');
      for (const perfil of ['inspetor', 'representante'] as const) {
        const { cookie } = await criarUsuarioComSessao(perfil);
        await request(app).patch(`/api/demandantes/${orgao.id}`).set('Cookie', cookie).send({ nome: 'Invadido' }).expect(403);
      }
      await request(app).patch(`/api/demandantes/${orgao.id}`).send({ nome: 'Invadido' }).expect(401);
      expect((await prisma.demandante.findUniqueOrThrow({ where: { id: orgao.id } })).nome).toBe('Órgão');
    });

    it('a categoria na criação só vale para o gestor; o inspetor sempre cria como "outro"', async () => {
      const gestor = await criarUsuarioComSessao('gestor');
      const inspetor = await criarUsuarioComSessao('inspetor');

      const doGestor = await request(app).post('/api/demandantes').set('Cookie', gestor.cookie).send({ nome: 'Classificado', tipo: 'saude' }).expect(201);
      const doInspetor = await request(app).post('/api/demandantes').set('Cookie', inspetor.cookie).send({ nome: 'Em campo', tipo: 'saude' }).expect(201);
      const semTipo = await request(app).post('/api/demandantes').set('Cookie', gestor.cookie).send({ nome: 'Sem tipo' }).expect(201);

      expect(doGestor.body.tipo).toBe('saude');
      expect(doInspetor.body.tipo).toBe('outro');
      expect(semTipo.body.tipo).toBe('outro');
      await request(app).post('/api/demandantes').set('Cookie', gestor.cookie).send({ nome: 'Inválido', tipo: 'xyz' }).expect(400);
    });
  });
});
