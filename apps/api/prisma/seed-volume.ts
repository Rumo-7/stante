// Gera dezenas de demandas de teste, com perfis diferentes por órgão, para ver a paginação e os gráficos
// de Demandantes com volume. SOMENTE DESENVOLVIMENTO: recusa rodar em produção.
//   npm run db:seed:volume               (gera, se ainda não houver)
//   npm run db:seed:volume -- --refazer  (apaga as geradas antes e gera de novo)
// As demandas geradas levam "[demo]" no assunto, e só elas são apagadas pelo --refazer.
import { PrismaClient } from '@prisma/client';
import { adicionarDias, hojeNoFuso } from '@stante/shared';

const prisma = new PrismaClient();

const TOTAL = 90;
const DIA_MS = 24 * 60 * 60 * 1000;

// Gerador pseudoaleatório com semente fixa: rodar de novo produz os mesmos números
function criarSorteio(semente: number) {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Perfil {
  nome: string;
  /** Peso no sorteio: quanto esse órgão envia em relação aos outros. */
  peso: number;
  /** Prazo que o órgão costuma conceder, em dias. */
  prazo: number;
  /** Quanto do prazo a VISAT costuma usar: abaixo de 1 é ágil, acima de 1 estoura o prazo. */
  ritmo: number;
}

const PERFIS: Perfil[] = [
  { nome: 'Ministério Público do Trabalho (MPT)', peso: 25, prazo: 15, ritmo: 0.8 },
  { nome: 'Justiça do Trabalho', peso: 15, prazo: 10, ritmo: 1.3 },
  { nome: 'Sindicatos de Trabalhadores', peso: 15, prazo: 20, ritmo: 0.6 },
  { nome: 'Ministério Público Estadual (MPE)', peso: 10, prazo: 15, ritmo: 0.9 },
  { nome: 'Auditoria Fiscal do Trabalho (MTE)', peso: 10, prazo: 12, ritmo: 1.1 },
  { nome: 'Unidades Básicas de Saúde (UBS)', peso: 8, prazo: 25, ritmo: 0.7 },
  { nome: 'Vigilância Sanitária (VISA)', peso: 7, prazo: 30, ritmo: 1.2 },
  { nome: 'Hospitais e Unidades de Pronto Atendimento (UPAs)', peso: 5, prazo: 20, ritmo: 0.95 },
  { nome: 'Comissão Intersetorial de Saúde do Trabalhador e da Trabalhadora (CISTT)', peso: 3, prazo: 40, ritmo: 0.5 },
  { nome: 'Cidadãos e Trabalhadores (via Ouvidoria)', peso: 2, prazo: 30, ritmo: 1.0 },
];

const TIPOS = [
  'Laudo de insalubridade',
  'Verificação de ergonomia',
  'Investigação de acidente fatal',
  'Ação de interdição cautelar',
  'Análise de surto ocupacional',
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este gerador é só para desenvolvimento e não roda em produção.');
  }

  if (process.argv.includes('--refazer')) {
    const apagadas = await prisma.demanda.deleteMany({ where: { assunto: { contains: '[demo]' } } });
    console.log(`Apagadas ${apagadas.count} demandas geradas antes.`);
  } else if ((await prisma.demanda.count({ where: { assunto: { contains: '[demo]' } } })) > 0) {
    console.log('Já existem demandas geradas. Use --refazer para gerar de novo.');
    return;
  }

  const orgaos = new Map((await prisma.demandante.findMany()).map((o) => [o.nome, o.id]));
  const fiscais = await prisma.fiscal.findMany({ select: { id: true } });
  if (fiscais.length === 0) throw new Error('Não há fiscais cadastrados (rode npm run db:seed antes).');

  const sortear = criarSorteio(2026);
  const agora = Date.now();
  const hoje = hojeNoFuso();
  const pesoTotal = PERFIS.reduce((soma, p) => soma + p.peso, 0);

  const escolherPerfil = () => {
    let ponto = sortear() * pesoTotal;
    for (const perfil of PERFIS) {
      ponto -= perfil.peso;
      if (ponto <= 0) return perfil;
    }
    return PERFIS[0]!;
  };

  const dados = [];
  for (let i = 1; i <= TOTAL; i += 1) {
    const perfil = escolherPerfil();
    const demandanteId = orgaos.get(perfil.nome);
    if (!demandanteId) throw new Error(`Órgão não encontrado: ${perfil.nome} (rode npm run db:seed antes).`);

    const diasAtras = Math.floor(sortear() * 170);
    const cadastro = new Date(agora - diasAtras * DIA_MS - Math.floor(sortear() * 8) * 60 * 60 * 1000);
    const diaDoCadastro = adicionarDias(hoje, -diasAtras);
    const prazoConcedido = Math.max(5, Math.round(perfil.prazo * (0.7 + sortear() * 0.6)));

    // Quanto a VISAT levaria de fato: em torno do prazo do órgão vezes o ritmo dele
    const tempoReal = perfil.prazo * perfil.ritmo * (0.5 + sortear());
    const conclusao = new Date(cadastro.getTime() + tempoReal * DIA_MS);
    const concluiu = conclusao.getTime() <= agora && sortear() < 0.92;

    dados.push({
      demandanteId,
      fiscalId: fiscais[Math.floor(sortear() * fiscais.length)]!.id,
      assunto: `${TIPOS[Math.floor(sortear() * TIPOS.length)]} — [demo] Empresa ${i}`,
      prazo: new Date(`${adicionarDias(diaDoCadastro, prazoConcedido)}T00:00:00.000Z`),
      status: concluiu ? ('concluida' as const) : sortear() < 0.5 ? ('aberta' as const) : ('em_andamento' as const),
      createdAt: cadastro,
      concluidaEm: concluiu ? conclusao : null,
    });
  }

  await prisma.demanda.createMany({ data: dados });

  const concluidas = dados.filter((d) => d.status === 'concluida').length;
  console.log(`Geradas ${dados.length} demandas (${concluidas} concluídas, ${dados.length - concluidas} em aberto).`);
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
