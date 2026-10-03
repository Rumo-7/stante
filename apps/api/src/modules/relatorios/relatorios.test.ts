import request from 'supertest';
import type { Prisma } from '@prisma/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { prisma } from '../../db';
import { ErroHttp } from '../../http/erros';
import {
  criarDemanda,
  criarDemandante,
  criarFiscal,
  criarUsuarioComSessao,
  data,
  limparBanco,
} from '../../test/fixtures';
import { numerosForaDosDados } from './conferencia';
import { montarFatos, type FatosParecer } from './fatos';
import { GeradorGroq, type GeradorDeTexto, type MensagemIA } from './gerador';
import { montarMensagens } from './prompt';

const PERIODO = { de: '2025-01-01', ate: '2025-03-31' };
const SEGREDO_NO_ASSUNTO = 'ASSUNTO-SECRETO-EMPRESA-XYZ';
const NOME_DE_FISCAL = 'Fiscal Sigiloso';

/** Horário de Recife (UTC-3). */
const em = (iso: string, hora = '12:00') => new Date(`${iso}T${hora}:00-03:00`);

beforeEach(limparBanco);
afterAll(() => prisma.$disconnect());

/**
 * Cenário com números fáceis de conferir à mão (hoje é bem depois de 2025, então o que ficou aberto está vencido):
 *   d1  Órgão A  concluída 10 dias depois, dentro do prazo
 *   d2  Órgão A  concluída 15 dias depois, FORA do prazo, e depois reaberta
 *   d3  Órgão A  aberta, vencida
 *   d4  Órgão B  concluída 7 dias depois, dentro do prazo
 *   d5  Órgão B  em andamento, vencida, aberta em campo
 *   d6  Órgão B  em análise (ignorada)   d7 cadastrada antes do período, mas concluída em janeiro
 *   d8  cadastrada depois do período (ignorada)
 */
async function cenario() {
  const orgA = await criarDemandante('Órgão A (OA)', 'ministerio_publico');
  const orgB = await criarDemandante('Órgão B', 'sindicato');
  const fiscal = await criarFiscal(NOME_DE_FISCAL);
  const bloqueado = await criarUsuarioComSessao('inspetor', { status: 'bloqueado' });
  await criarFiscal('Fiscal Bloqueado', bloqueado.user.id);

  const nova = (
    demandanteId: number,
    status: 'aberta' | 'em_andamento' | 'concluida' | 'em_analise',
    prazo: string,
    cadastro: string,
    concluidaEm: Date | null = null,
    extras: Partial<Prisma.DemandaUncheckedCreateInput> = {},
  ) =>
    criarDemanda({
      demandanteId,
      assunto: `${SEGREDO_NO_ASSUNTO} ${cadastro}`,
      status,
      prazo: data(prazo),
      createdAt: em(cadastro),
      concluidaEm,
      ...extras,
    });

  await nova(orgA.id, 'concluida', '2025-01-30', '2025-01-10', em('2025-01-20'), { fiscalId: fiscal.id });
  const d2 = await nova(orgA.id, 'concluida', '2025-02-10', '2025-02-05', em('2025-02-20'), { fiscalId: fiscal.id });
  await nova(orgA.id, 'aberta', '2025-03-01', '2025-02-15');
  await nova(orgB.id, 'concluida', '2025-03-20', '2025-03-03', em('2025-03-10'));
  await nova(orgB.id, 'em_andamento', '2025-04-30', '2025-03-20', null, { origem: 'campo' });
  await nova(orgB.id, 'em_analise', '2025-04-30', '2025-03-25', null, { origem: 'campo' });
  await nova(orgA.id, 'concluida', '2025-01-15', '2024-12-20', em('2025-01-05'));
  await nova(orgA.id, 'aberta', '2025-05-30', '2025-04-10');
  await prisma.historicoDemanda.create({ data: { demandaId: d2.id, tipo: 'reaberta', dados: {} } });
  return { orgA, orgB };
}

describe('montarFatos', () => {
  it('calcula os números do período, conferidos à mão', async () => {
    await cenario();
    const fatos = await montarFatos(PERIODO);

    expect(fatos.periodo).toEqual({ ...PERIODO, rotulo: '01/01/2025 a 31/03/2025' });
    expect(fatos.demandas).toEqual({
      recebidas: 5,
      concluidas: 3,
      taxaConclusaoPct: 60,
      emAberto: 2,
      vencidas: 2,
      concluidasNoPrazo: 2,
      concluidasForaDoPrazo: 1,
      pontualidadePct: 40, // 2 no prazo em (2 + 1 fora + 2 vencidas)
      tempoMedianoParaConcluirDias: 10, // mediana de 7, 10 e 15
      prazoConcedidoMedianoDias: 17, // mediana de 5, 14, 17, 20 e 41
      abertasEmCampo: 1,
      reaberturas: 1,
      reaberturasPct: 20,
    });
  });

  it('separa por categoria de órgão e lista os principais órgãos', async () => {
    await cenario();
    const fatos = await montarFatos(PERIODO);

    expect(fatos.porCategoriaDeOrgao).toEqual([
      { categoria: 'Ministério Público', recebidas: 3, concluidas: 2, taxaConclusaoPct: 67, pontualidadePct: 33 },
      { categoria: 'Sindicatos', recebidas: 2, concluidas: 1, taxaConclusaoPct: 50, pontualidadePct: 50 },
    ]);
    expect(fatos.principaisOrgaos).toEqual([
      { nome: 'Órgão A (OA)', recebidas: 3, participacaoPct: 60, concluidas: 2, vencidas: 1, pontualidadePct: 33, tempoMedianoParaConcluirDias: 12.5 },
      { nome: 'Órgão B', recebidas: 2, participacaoPct: 40, concluidas: 1, vencidas: 1, pontualidadePct: 50, tempoMedianoParaConcluirDias: 7 },
    ]);
  });

  it('a tendência mensal conta as recebidas pelo cadastro e as concluídas pela data de conclusão', async () => {
    await cenario();
    const fatos = await montarFatos(PERIODO);
    expect(fatos.tendenciaMensal).toEqual([
      { mes: 'Jan/2025', recebidas: 1, concluidas: 2 }, // concluídas: d1 e d7 (que entrou em dezembro)
      { mes: 'Fev/2025', recebidas: 2, concluidas: 1 },
      { mes: 'Mar/2025', recebidas: 2, concluidas: 1 },
    ]);
  });

  it('a equipe conta só fiscais sem acesso bloqueado', async () => {
    await cenario();
    const { equipe } = await montarFatos(PERIODO);
    expect(equipe).toEqual({ fiscaisAtivos: 1, mediaDeDemandasPorFiscal: 2 });
  });

  it('diz o que o sistema não registra, para a IA não inventar', async () => {
    await cenario();
    const { naoDisponivelNoSistema } = await montarFatos(PERIODO);
    expect(naoDisponivelNoSistema.join(' ')).toMatch(/SINAN/);
    expect(naoDisponivelNoSistema.join(' ')).toMatch(/CNAE/);
    expect(naoDisponivelNoSistema.join(' ')).toMatch(/Interdições/);
  });

  it('NÃO leva dados pessoais nem o texto das demandas: só números e nomes de órgãos', async () => {
    await cenario();
    const texto = JSON.stringify(await montarFatos(PERIODO));

    expect(texto).not.toContain(SEGREDO_NO_ASSUNTO);
    expect(texto).not.toContain(NOME_DE_FISCAL);
    expect(texto).not.toContain('Fiscal Bloqueado');
    expect(texto).not.toMatch(/@teste\.com/);
    expect(texto).not.toMatch(/Usuário \d/);
  });

  it('período com mais de 12 meses mostra os 12 últimos', async () => {
    const fatos = await montarFatos({ de: '2024-12-15', ate: '2025-12-15' });
    expect(fatos.tendenciaMensal).toHaveLength(12);
    expect(fatos.tendenciaMensal[0]!.mes).toBe('Jan/2025');
    expect(fatos.tendenciaMensal[11]!.mes).toBe('Dez/2025');
  });

  it('período sem demandas não inventa taxas', async () => {
    const fatos = await montarFatos(PERIODO);
    expect(fatos.demandas).toMatchObject({
      recebidas: 0,
      taxaConclusaoPct: null,
      pontualidadePct: null,
      tempoMedianoParaConcluirDias: null,
      reaberturasPct: null,
    });
    expect(fatos.equipe.mediaDeDemandasPorFiscal).toBeNull();
  });
});

describe('montarMensagens', () => {
  it('leva as regras e os dados, e nada de pessoal', async () => {
    await cenario();
    const fatos = await montarFatos(PERIODO);
    const [sistema, usuario] = montarMensagens(fatos);

    expect(sistema!.role).toBe('system');
    expect(sistema!.content).toContain('SOMENTE os dados');
    expect(sistema!.content).toContain('Não invente');
    expect(sistema!.content).toContain('## 3. LIMITAÇÕES DOS DADOS');
    expect(usuario!.role).toBe('user');
    expect(usuario!.content).toContain('"recebidas": 5');
    expect(usuario!.content).toContain('naoDisponivelNoSistema');
    expect(usuario!.content).not.toContain(SEGREDO_NO_ASSUNTO);
    expect(usuario!.content).not.toContain(NOME_DE_FISCAL);
  });
});

describe('numerosForaDosDados', () => {
  const fatos = {
    periodo: { de: '2025-01-01', ate: '2025-03-31', rotulo: '01/01/2025 a 31/03/2025' },
    demandas: { recebidas: 5, taxaConclusaoPct: 60, tempoMedianoParaConcluirDias: 16.5 },
  } as unknown as FatosParecer;

  it('aceita o que está nos dados, inclusive porcentagem, ano e decimal com vírgula', () => {
    const texto = 'Em 2025 foram recebidas 5 demandas (60% concluídas), com mediana de 16,5 dias; de 01/01/2025 a 31/03/2025.';
    expect(numerosForaDosDados(texto, fatos)).toEqual([]);
  });

  it('16.5, 16,5 e 16,50 são o mesmo número', () => {
    expect(numerosForaDosDados('16.5 dias, 16,5 dias e 16,50 dias', fatos)).toEqual([]);
  });

  it('aponta o número que a IA inventou, uma vez só', () => {
    expect(numerosForaDosDados('Foram lavradas 37 interdições; as 37 interdições e 12 autos.', fatos)).toEqual(['37', '12']);
  });

  it('ignora a numeração de títulos e de listas', () => {
    const texto = '## 1. IDENTIFICAÇÃO\n2) segundo item\n- 3. terceiro item\nTexto com 5 demandas.';
    expect(numerosForaDosDados(texto, fatos)).toEqual([]);
  });
});

describe('GeradorGroq', () => {
  const MENSAGENS: MensagemIA[] = [
    { role: 'system', content: 'regras' },
    { role: 'user', content: 'dados' },
  ];
  const CHAVE = 'gsk_chave-secreta-de-teste';

  const resposta = (corpo: unknown, status = 200) =>
    new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status });

  const gerador = (fetchImpl: typeof fetch) =>
    new GeradorGroq({ chave: CHAVE, modelo: 'modelo-de-teste', fetchImpl, url: 'https://exemplo.test/chat' });

  it('envia o pedido no formato esperado e lê a resposta', async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    const fetchFalso = (async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return resposta({
        model: 'modelo-de-teste-v2',
        choices: [{ message: { content: '  Texto do parecer  ' } }],
        usage: { prompt_tokens: 120, completion_tokens: 80 },
      });
    }) as unknown as typeof fetch;

    const saida = await gerador(fetchFalso).gerar(MENSAGENS);

    expect(saida).toEqual({ texto: 'Texto do parecer', modelo: 'modelo-de-teste-v2', tokensEntrada: 120, tokensSaida: 80 });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.url).toBe('https://exemplo.test/chat');
    const init = chamadas[0]!.init;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${CHAVE}`);
    const corpo = JSON.parse(init.body as string);
    expect(corpo).toMatchObject({ model: 'modelo-de-teste', messages: MENSAGENS, temperature: 0.2, max_tokens: 4000 });
    // Modelo comum não recebe parâmetros que ele poderia recusar
    expect(corpo).not.toHaveProperty('reasoning_effort');
  });

  it('nos modelos gpt-oss pede raciocínio curto, para sobrar espaço para o texto', async () => {
    const corpos: Record<string, unknown>[] = [];
    const fetchFalso = (async (_url: string, init: RequestInit) => {
      corpos.push(JSON.parse(init.body as string));
      return resposta({ choices: [{ message: { content: 'ok' } }] });
    }) as unknown as typeof fetch;

    await new GeradorGroq({ chave: CHAVE, modelo: 'openai/gpt-oss-120b', fetchImpl: fetchFalso, url: 'https://exemplo.test/chat' }).gerar(MENSAGENS);

    expect(corpos[0]).toMatchObject({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low' });
  });

  it('avisa quando a resposta foi cortada pelo limite de tamanho', async () => {
    const cortada = (async () =>
      resposta({ choices: [{ message: { content: 'Texto pela metade' }, finish_reason: 'length' }] })) as unknown as typeof fetch;
    const completa = (async () =>
      resposta({ choices: [{ message: { content: 'Texto inteiro' }, finish_reason: 'stop' }] })) as unknown as typeof fetch;

    expect((await gerador(cortada).gerar(MENSAGENS)).truncada).toBe(true);
    expect((await gerador(completa).gerar(MENSAGENS)).truncada).toBe(false);
  });

  it('remove o raciocínio que alguns modelos devolvem entre <think> e </think>', async () => {
    const fetchFalso = (async () =>
      resposta({ choices: [{ message: { content: '<think>pensando em voz alta\nmais uma linha</think>\n## 1. Texto final' } }] })) as unknown as typeof fetch;
    expect((await gerador(fetchFalso).gerar(MENSAGENS)).texto).toBe('## 1. Texto final');
  });

  it('uma resposta que é só raciocínio conta como vazia', async () => {
    const fetchFalso = (async () =>
      resposta({ choices: [{ message: { content: '<think>só isso</think>' } }] })) as unknown as typeof fetch;
    await expect(gerador(fetchFalso).gerar(MENSAGENS)).rejects.toMatchObject({ status: 502 });
  });

  describe('falhas', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    const falhaCom = async (fetchImpl: typeof fetch): Promise<ErroHttp> => {
      try {
        await gerador(fetchImpl).gerar(MENSAGENS);
      } catch (erro) {
        return erro as ErroHttp;
      }
      throw new Error('deveria ter falhado');
    };

    it.each([
      [401, 502, /chave de acesso/],
      [403, 502, /chave de acesso/],
      [429, 429, /limite de uso/],
      [400, 502, /recusou o pedido/],
      [404, 502, /modelo de IA "modelo-de-teste"/],
      [500, 502, /indisponível/],
      [503, 502, /indisponível/],
    ])('status %i do serviço vira %i com mensagem clara', async (statusDoServico, statusNosso, mensagem) => {
      const erro = await falhaCom((async () => resposta({ error: { message: 'detalhe interno' } }, statusDoServico)) as unknown as typeof fetch);
      expect(erro.status).toBe(statusNosso);
      expect(erro.message).toMatch(mensagem);
      // Nem a chave nem o detalhe do serviço chegam até quem usa o sistema
      expect(erro.message).not.toContain(CHAVE);
      expect(erro.message).not.toContain('detalhe interno');
    });

    it('modelo descontinuado: a mensagem diz qual modelo e como achar outro; o detalhe da Groq vai só para o log', async () => {
      const fetchFalso = (async () =>
        resposta(
          { error: { message: 'The model `antigo` has been decommissioned', code: 'model_decommissioned' } },
          400,
        )) as unknown as typeof fetch;

      const erro = await falhaCom(fetchFalso);

      expect(erro.status).toBe(502);
      expect(erro.message).toContain('"modelo-de-teste"');
      expect(erro.message).toContain('npm run ia:modelos');
      expect(erro.message).not.toContain('decommissioned');
      // O motivo exato fica no log do servidor, sem a chave
      const log = JSON.stringify(vi.mocked(console.error).mock.calls);
      expect(log).toContain('decommissioned');
      expect(log).not.toContain(CHAVE);
    });

    it('resposta sem texto ou que não é JSON é erro', async () => {
      const vazia = await falhaCom((async () => resposta({ choices: [{ message: { content: '   ' } }] })) as unknown as typeof fetch);
      const lixo = await falhaCom((async () => resposta('isto não é json')) as unknown as typeof fetch);
      expect(vazia.status).toBe(502);
      expect(lixo.status).toBe(502);
    });

    it('demora demais vira 504; falha de rede vira 502; nenhuma mostra a chave', async () => {
      const lento = await falhaCom((async () => {
        throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
      }) as unknown as typeof fetch);
      const semRede = await falhaCom((async () => {
        throw new Error(`falha com ${CHAVE}`);
      }) as unknown as typeof fetch);

      expect(lento.status).toBe(504);
      expect(semRede.status).toBe(502);
      expect(semRede.message).not.toContain(CHAVE);
      // O que vai para o log do servidor também não leva a chave
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(CHAVE);
    });
  });
});

describe('API de pareceres', () => {
  const TEXTO_DA_IA = '## 1. IDENTIFICAÇÃO E OBJETIVO\nForam recebidas 5 demandas e lavradas 99 interdições.';

  function geradorFalso(texto = TEXTO_DA_IA) {
    const chamadas: MensagemIA[][] = [];
    const gerador: GeradorDeTexto = {
      modelo: 'modelo-falso',
      async gerar(mensagens) {
        chamadas.push(mensagens);
        return { texto, modelo: 'modelo-falso', tokensEntrada: 300, tokensSaida: 150 };
      },
    };
    return { gerador, chamadas };
  }

  const gerarParecer = (app: ReturnType<typeof createApp>, cookie: string, corpo: object = PERIODO) =>
    request(app).post('/api/relatorios/parecer').set('Cookie', cookie).send(corpo);

  it('exige login e é só do gestor', async () => {
    const app = createApp({ gerador: geradorFalso().gerador });
    await request(app).post('/api/relatorios/parecer').send(PERIODO).expect(401);
    for (const perfil of ['inspetor', 'representante'] as const) {
      const { cookie } = await criarUsuarioComSessao(perfil);
      await gerarParecer(app, cookie).expect(403);
      await request(app).get('/api/relatorios').set('Cookie', cookie).expect(403);
      await request(app).get('/api/relatorios/configuracao').set('Cookie', cookie).expect(403);
      await request(app).get('/api/relatorios/fatos').query(PERIODO).set('Cookie', cookie).expect(403);
    }
    expect(await prisma.relatorio.count()).toBe(0);
  });

  it('informa se a IA está configurada', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const com = await request(createApp({ gerador: geradorFalso().gerador })).get('/api/relatorios/configuracao').set('Cookie', cookie).expect(200);
    const sem = await request(createApp({ gerador: null })).get('/api/relatorios/configuracao').set('Cookie', cookie).expect(200);
    expect(com.body).toEqual({ iaDisponivel: true, modelo: 'modelo-falso' });
    expect(sem.body).toEqual({ iaDisponivel: false, modelo: null });
  });

  it('mostra os números que a IA receberia, sem chamar a IA', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    await cenario();
    const { gerador, chamadas } = geradorFalso();
    const res = await request(createApp({ gerador })).get('/api/relatorios/fatos').query(PERIODO).set('Cookie', cookie).expect(200);

    expect(res.body.demandas.recebidas).toBe(5);
    expect(chamadas).toHaveLength(0);
  });

  it('gera o parecer, guarda com os números usados e conferência, e acrescenta o aviso de minuta', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    await cenario();
    const { gerador, chamadas } = geradorFalso();

    const res = await gerarParecer(createApp({ gerador }), gestor.cookie).expect(201);

    expect(res.body.texto).toContain(TEXTO_DA_IA);
    expect(res.body.texto).toContain('Minuta gerada automaticamente por IA (modelo modelo-falso)');
    expect(res.body).toMatchObject({ periodo: PERIODO, modelo: 'modelo-falso', geradoPor: gestor.user.nome });
    expect(res.body.fatos.demandas.recebidas).toBe(5);
    // O "99" não está nos dados: o gestor é avisado. O "5", que está, não é apontado.
    expect(res.body.numerosParaConferir).toEqual(['99']);

    expect(chamadas).toHaveLength(1);
    expect(JSON.stringify(chamadas[0])).not.toContain(SEGREDO_NO_ASSUNTO);
    expect(JSON.stringify(chamadas[0])).not.toContain(NOME_DE_FISCAL);

    const salvo = await prisma.relatorio.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(salvo).toMatchObject({ modelo: 'modelo-falso', tokensEntrada: 300, tokensSaida: 150, geradoPorId: gestor.user.id });
    expect((salvo.fatos as unknown as FatosParecer).demandas.recebidas).toBe(5);
  });

  it('parecer que a IA deixou pela metade é marcado como incompleto dentro do próprio texto', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    await cenario();
    const cortado: GeradorDeTexto = {
      modelo: 'modelo-falso',
      async gerar() {
        return { texto: '## 1. IDENTIFICAÇÃO E OBJETIVO\nComeço do texto', modelo: 'modelo-falso', tokensEntrada: 1, tokensSaida: 4000, truncada: true };
      },
    };

    const res = await gerarParecer(createApp({ gerador: cortado }), gestor.cookie).expect(201);

    expect(res.body.texto).toContain('a IA interrompeu a resposta por limite de tamanho');
    expect(res.body.texto).toContain('incompleto');
  });

  it('sem IA configurada responde 503 e não grava nada', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    await cenario();
    const res = await gerarParecer(createApp({ gerador: null }), cookie);
    expect(res.status).toBe(503);
    expect(await prisma.relatorio.count()).toBe(0);
  });

  it('período sem demandas responde 422, sem gastar a IA', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const { gerador, chamadas } = geradorFalso();
    const res = await gerarParecer(createApp({ gerador }), cookie);
    expect(res.status).toBe(422);
    expect(chamadas).toHaveLength(0);
  });

  it('erro do serviço de IA chega a quem usa, com a mensagem clara, e nada é gravado', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    await cenario();
    const limitado: GeradorDeTexto = {
      modelo: 'modelo-falso',
      async gerar() {
        throw new ErroHttp(429, 'O limite de uso do serviço de IA foi atingido. Tente de novo em alguns minutos.');
      },
    };
    const res = await gerarParecer(createApp({ gerador: limitado }), cookie);
    expect(res.status).toBe(429);
    expect(res.body.erro).toMatch(/limite de uso/);
    expect(await prisma.relatorio.count()).toBe(0);
  });

  it.each([
    ['sem período', {}, 'Informe o período do parecer.'],
    ['data fora do formato', { de: '01/01/2025', ate: '2025-03-31' }, 'Data inválida (use AAAA-MM-DD).'],
    ['período invertido', { de: '2025-03-31', ate: '2025-01-01' }, 'A data inicial não pode ser depois da final.'],
    ['período maior que um ano', { de: '2024-01-01', ate: '2025-12-31' }, 'O período do parecer pode ter no máximo um ano.'],
  ])('rejeita %s', async (_nome, corpo, mensagem) => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const { gerador, chamadas } = geradorFalso();
    const res = await gerarParecer(createApp({ gerador }), cookie, corpo);
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe(mensagem);
    expect(chamadas).toHaveLength(0);
  });

  it('lista os mais recentes sem o texto, e abre um parecer completo pelo id', async () => {
    const gestor = await criarUsuarioComSessao('gestor');
    await cenario();
    const app = createApp({ gerador: geradorFalso().gerador });
    const primeiro = (await gerarParecer(app, gestor.cookie).expect(201)).body;
    const segundo = (await gerarParecer(app, gestor.cookie, { de: '2025-02-01', ate: '2025-03-31' }).expect(201)).body;

    const lista = await request(app).get('/api/relatorios').set('Cookie', gestor.cookie).expect(200);
    expect(lista.body.map((r: { id: number }) => r.id)).toEqual([segundo.id, primeiro.id]);
    expect(lista.body[0]).not.toHaveProperty('texto');
    expect(lista.body[0]).not.toHaveProperty('fatos');
    expect(lista.body[0]).toMatchObject({ periodo: { de: '2025-02-01', ate: '2025-03-31' }, geradoPor: gestor.user.nome });

    const aberto = await request(app).get(`/api/relatorios/${primeiro.id}`).set('Cookie', gestor.cookie).expect(200);
    expect(aberto.body.texto).toBe(primeiro.texto);
    expect(aberto.body.fatos.demandas.recebidas).toBe(5);
  });

  it('parecer inexistente ou id inválido responde 404', async () => {
    const { cookie } = await criarUsuarioComSessao('gestor');
    const app = createApp({ gerador: null });
    await request(app).get('/api/relatorios/999999').set('Cookie', cookie).expect(404);
    await request(app).get('/api/relatorios/abc').set('Cookie', cookie).expect(404);
  });
});
