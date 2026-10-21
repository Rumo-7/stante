// Dados curados para APRESENTAR o sistema (status report, demonstração ao cliente).
//   npm run db:seed:apresentacao -- --confirmar
// Apaga TODAS as demandas, anexos, histórico, notificações e pareceres e recria um cenário fixo e realista.
// Usuários, fiscais e órgãos são mantidos. As datas são relativas a hoje: rodar de novo antes de cada
// apresentação "restaura" o estado limpo, com os prazos sempre atuais.
// Todos os nomes de empresas são fictícios. SOMENTE bancos locais: recusa produção e hosts remotos.
import { PrismaClient, type Prisma, type StatusDemanda } from '@prisma/client';
import { adicionarDias, hojeNoFuso } from '@stante/shared';
import { hashSenha } from '../src/auth/senha';

const prisma = new PrismaClient();

const hoje = hojeNoFuso();
const dataEm = (dias: number) => new Date(`${adicionarDias(hoje, dias)}T00:00:00.000Z`);
const instanteHa = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

const MPT = 'Ministério Público do Trabalho (MPT)';
const MPE = 'Ministério Público Estadual (MPE)';
const JT = 'Justiça do Trabalho';
const SIND = 'Sindicatos de Trabalhadores';
const CISTT = 'Comissão Intersetorial de Saúde do Trabalhador e da Trabalhadora (CISTT)';
const MTE = 'Auditoria Fiscal do Trabalho (MTE)';
const UPA = 'Hospitais e Unidades de Pronto Atendimento (UPAs)';
const UBS = 'Unidades Básicas de Saúde (UBS)';
const VISA = 'Vigilância Sanitária (VISA)';
const CID = 'Cidadãos e Trabalhadores (via Ouvidoria)';

const CARLOS = 'Carlos Melo';
const PATRICIA = 'Patrícia Souza';
const RICARDO = 'Ricardo Alves';
const FERNANDA = 'Fernanda Costa';

/** Demanda já concluída: serve de histórico para pontualidade, tempo médio, tendência e Radar. */
type Concluida = [demandante: string, assunto: string, criadaHa: number, concedido: number, usou: number, fiscal: string];

const CONCLUIDAS: Concluida[] = [
  // MPT: volume alto e entrega pontual
  [MPT, 'Laudo de insalubridade — Metalúrgica Orion', 265, 15, 11, CARLOS],
  [MPT, 'Vistoria por acidente grave — Construtora Vega', 228, 15, 12, PATRICIA],
  [MPT, 'Análise de PPRA/PGR — Indústria Têxtil Aurora', 190, 15, 10, FERNANDA],
  [MPT, 'Inspeção de condições sanitárias — Abatedouro Pampa', 140, 15, 13, CARLOS],
  [MPT, 'Laudo de periculosidade — Posto Rota 101', 96, 15, 9, RICARDO],
  [MPT, 'Vistoria em canteiro de obras — Residencial Mirante', 52, 15, 12, PATRICIA],
  // Justiça do Trabalho: prazos curtos, a unidade costuma passar do prazo
  [JT, 'Perícia ergonômica — Teleatendimento Horizonte', 250, 10, 14, RICARDO],
  [JT, 'Perícia de insalubridade — Lavanderia Cristal', 205, 10, 13, FERNANDA],
  [JT, 'Perícia de acidente de trabalho — Transportadora Delta Sul', 160, 10, 9, CARLOS],
  [JT, 'Perícia de ruído — Gráfica Prisma', 110, 10, 15, FERNANDA],
  [JT, 'Perícia ergonômica — Escritório Contábil Alfa', 63, 10, 12, RICARDO],
  // Sindicatos: prazos longos, entrega rápida
  [SIND, 'Denúncia de calor excessivo — Fundição Titã', 258, 20, 9, FERNANDA],
  [SIND, 'Avaliação de EPIs — Frigorífico Serra Azul', 214, 20, 11, CARLOS],
  [SIND, 'Denúncia de assédio e jornada — Rede de Supermercados Lume', 170, 20, 8, PATRICIA],
  [SIND, 'Inspeção de ventilação — Confecção Estrela', 118, 20, 12, FERNANDA],
  [SIND, 'Denúncia de ausência de CIPA — Oficina Mecânica Norte', 70, 20, 10, CARLOS],
  // MPE: ritmo no limite do prazo
  [MPE, 'Investigação de intoxicação — Usina Canavial', 236, 15, 14, FERNANDA],
  [MPE, 'Apuração de doença ocupacional — Cerâmica Barro Forte', 182, 15, 16, PATRICIA],
  [MPE, 'Vistoria por exposição a agrotóxicos — Fazenda Santa Aurora', 125, 15, 13, CARLOS],
  [MPE, 'Apuração de adoecimento mental — Banco Meridional', 58, 15, 17, PATRICIA],
  // CISTT: prazos longos e relatórios
  [CISTT, 'Relatório de ações do 1º semestre', 240, 30, 24, PATRICIA],
  [CISTT, 'Parecer sobre indicadores de acidentes de trabalho', 150, 30, 27, RICARDO],
  [CISTT, 'Nota técnica sobre trabalho em calor', 80, 30, 21, FERNANDA],
  // Auditoria Fiscal (MTE)
  [MTE, 'Inspeção conjunta — Terminal Marítimo Tupi', 220, 12, 10, CARLOS],
  [MTE, 'Inspeção conjunta — Estaleiro Boreal', 135, 12, 9, RICARDO],
  [MTE, 'Inspeção conjunta — Complexo Industrial Atlas', 45, 12, 11, CARLOS],
  // Hospitais e UPAs: notificações urgentes
  [UPA, 'Acidente com material biológico — Hospital Esperança', 210, 7, 6, PATRICIA],
  [UPA, 'Acidente com perfurocortante — UPA Boa Viagem', 165, 7, 8, PATRICIA],
  [UPA, 'Notificação de acidente grave — Hospital Santa Clara', 100, 7, 5, FERNANDA],
  [UPA, 'Exposição a radiação — Clínica Imagem Total', 33, 7, 7, PATRICIA],
  // UBS
  [UBS, 'Notificação de LER/DORT — Escola Municipal Ipê', 195, 10, 7, RICARDO],
  [UBS, 'Notificação de dermatose ocupacional — Salão Beleza & Cia', 105, 10, 8, FERNANDA],
  [UBS, 'Notificação de perda auditiva — Marcenaria Cedro', 40, 10, 6, PATRICIA],
  // VISA
  [VISA, 'Parecer sanitário — Lavanderia Industrial Neve', 245, 20, 17, FERNANDA],
  [VISA, 'Parecer sanitário — Cozinha Industrial Sabor Real', 130, 20, 15, PATRICIA],
  [VISA, 'Inspeção conjunta — Clínica Odontológica Sorriso', 55, 20, 18, FERNANDA],
  // Cidadãos (ouvidoria)
  [CID, 'Denúncia de falta de EPI — Obra Residencial Jardins', 232, 15, 12, CARLOS],
  [CID, 'Denúncia de ambiente insalubre — Armazém Central', 155, 15, 10, RICARDO],
  [CID, 'Denúncia de trabalho em altura — Obra Edifício Solaris', 87, 15, 14, CARLOS],
  [CID, 'Denúncia de jornada abusiva — Restaurante Maré Cheia', 28, 15, 11, PATRICIA],
];

/** Demanda ainda em curso: é o que o gestor vê no dia a dia (vencidas, críticas, riscos do Radar). */
interface EmCurso {
  demandante: string;
  assunto: string;
  criadaHa: number;
  concedido: number;
  status: StatusDemanda;
  fiscal: string | null;
  campo?: boolean;
}

const EM_CURSO: EmCurso[] = [
  { demandante: MPT, assunto: 'Laudo de insalubridade — Frigorífico Boa Carne', criadaHa: 40, concedido: 36, status: 'aberta', fiscal: CARLOS },
  { demandante: MPT, assunto: 'Vistoria por acidente fatal — Construtora Alfa', criadaHa: 12, concedido: 14, status: 'em_andamento', fiscal: PATRICIA },
  { demandante: MPT, assunto: 'Atualização cadastral de empresas', criadaHa: 22, concedido: 23, status: 'em_andamento', fiscal: FERNANDA },
  { demandante: JT, assunto: 'Perícia ergonômica — Central de atendimento Beta', criadaHa: 6, concedido: 10, status: 'aberta', fiscal: RICARDO },
  { demandante: JT, assunto: 'Perícia de condições de trabalho — Armazém Lambda', criadaHa: 9, concedido: 12, status: 'em_andamento', fiscal: CARLOS },
  { demandante: SIND, assunto: 'Denúncia de ruído excessivo — Metalúrgica Gama', criadaHa: 20, concedido: 32, status: 'em_andamento', fiscal: FERNANDA },
  { demandante: SIND, assunto: 'Avaliação de EPIs — Frigorífico Kappa', criadaHa: 15, concedido: 75, status: 'aberta', fiscal: RICARDO },
  { demandante: MPE, assunto: 'Investigação de intoxicação — Usina Delta', criadaHa: 3, concedido: 48, status: 'aberta', fiscal: CARLOS },
  { demandante: MPE, assunto: 'Apuração de adoecimento — Call center Ômega', criadaHa: 8, concedido: 15, status: 'aberta', fiscal: CARLOS },
  { demandante: CISTT, assunto: 'Relatório de ações do 2º semestre', criadaHa: 5, concedido: 30, status: 'aberta', fiscal: null },
  { demandante: MTE, assunto: 'Inspeção conjunta — Terminal portuário Sigma', criadaHa: 5, concedido: 12, status: 'aberta', fiscal: CARLOS },
  { demandante: UPA, assunto: 'Acidente com material biológico — Hospital Eta', criadaHa: 4, concedido: 7, status: 'aberta', fiscal: null },
  { demandante: UBS, assunto: 'Notificação de LER/DORT — Escola Épsilon', criadaHa: 2, concedido: 10, status: 'aberta', fiscal: PATRICIA },
  { demandante: CID, assunto: 'Denúncia de falta de ventilação — Padaria Pão Quente', criadaHa: 10, concedido: 15, status: 'aberta', fiscal: RICARDO },
  // Abertas em campo pela inspetora de demonstração, aguardando a validação do gestor
  { demandante: CID, assunto: 'Denúncia de trabalho em altura sem proteção — Obra Theta', criadaHa: 1, concedido: 7, status: 'em_analise', fiscal: PATRICIA, campo: true },
  { demandante: CID, assunto: 'Calor excessivo em fundição — Indústria Iota', criadaHa: 0, concedido: 9, status: 'em_analise', fiscal: PATRICIA, campo: true },
];

function conferirAmbiente() {
  if (process.env.NODE_ENV === 'production') throw new Error('Recusado: este script nunca roda em produção.');
  if (!process.argv.includes('--confirmar')) {
    throw new Error(
      'Isto APAGA todas as demandas, anexos, notificações e pareceres do banco configurado.\n' +
        'Para continuar: npm run db:seed:apresentacao -- --confirmar',
    );
  }
  const url = process.env.DATABASE_URL ?? '';
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(`Recusado: o banco (${host || 'DATABASE_URL ausente'}) não é local.`);
  }
}

async function garantirContaDemo(nome: string, email: string, perfil: 'inspetor' | 'representante', senha: string) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { nome, email, senhaHash: await hashSenha(senha), perfil, status: 'ativo' },
  });
}

async function main() {
  conferirAmbiente();

  const senha = process.env.SEED_DEMO_SENHA;
  if (!senha || senha.length < 8) throw new Error('Defina SEED_DEMO_SENHA (mínimo 8 caracteres) no apps/api/.env.');

  const fiscais = new Map((await prisma.fiscal.findMany()).map((f) => [f.nome, f.id]));
  const demandantes = new Map((await prisma.demandante.findMany()).map((d) => [d.nome, d.id]));
  const idFiscal = (nome: string) => fiscais.get(nome) ?? (() => { throw new Error(`Fiscal não encontrado: ${nome} (rode npm run db:seed antes)`); })();
  const idDemandante = (nome: string) => demandantes.get(nome) ?? (() => { throw new Error(`Demandante não encontrado: ${nome} (rode npm run db:seed antes)`); })();

  const inspetor = await garantirContaDemo('Patrícia Souza (demo)', 'inspetor@stante.local', 'inspetor', senha);
  await prisma.fiscal.update({ where: { id: idFiscal(PATRICIA) }, data: { userId: inspetor.id } });
  const representante = await garantirContaDemo('Representante MPT (demo)', 'representante@stante.local', 'representante', senha);
  await prisma.user.update({ where: { id: representante.id }, data: { demandanteId: idDemandante(MPT) } });

  // Cascata do banco leva anexos, histórico e notificações das demandas
  const apagadas = await prisma.demanda.deleteMany();
  await prisma.relatorio.deleteMany();

  for (const [demandante, assunto, criadaHa, concedido, usou, fiscal] of CONCLUIDAS) {
    const concluidaHa = criadaHa - usou;
    if (concluidaHa < 0) throw new Error(`Dados inconsistentes (concluída no futuro): ${assunto}`);
    await prisma.demanda.create({
      data: {
        demandanteId: idDemandante(demandante),
        fiscalId: idFiscal(fiscal),
        assunto,
        prazo: dataEm(concedido - criadaHa),
        status: 'concluida',
        createdAt: instanteHa(criadaHa),
        concluidaEm: instanteHa(concluidaHa),
        historico: {
          create: [
            { tipo: 'criada', dados: { origem: 'planejada' }, createdAt: instanteHa(criadaHa) },
            { tipo: 'status_alterado', dados: { de: 'em_andamento', para: 'concluida' }, createdAt: instanteHa(concluidaHa) },
          ],
        },
      },
    });
  }

  for (const d of EM_CURSO) {
    const historico: Prisma.HistoricoDemandaCreateWithoutDemandaInput[] = [
      { tipo: 'criada', dados: { origem: d.campo ? 'campo' : 'planejada' }, createdAt: instanteHa(d.criadaHa), autor: d.campo ? { connect: { id: inspetor.id } } : undefined },
    ];
    if (d.status === 'em_andamento') {
      historico.push({ tipo: 'status_alterado', dados: { de: 'aberta', para: 'em_andamento' }, createdAt: instanteHa(Math.max(d.criadaHa - 2, 0)) });
    }
    await prisma.demanda.create({
      data: {
        demandanteId: idDemandante(d.demandante),
        fiscalId: d.fiscal ? idFiscal(d.fiscal) : null,
        assunto: d.assunto,
        prazo: dataEm(d.concedido - d.criadaHa),
        status: d.status,
        origem: d.campo ? 'campo' : 'planejada',
        criadaPorId: d.campo ? inspetor.id : null,
        createdAt: instanteHa(d.criadaHa),
        historico: { create: historico },
      },
    });
  }

  console.log(`Removidas ${apagadas.count} demandas anteriores (e pareceres).`);
  console.log(`Cenário de apresentação criado: ${CONCLUIDAS.length} concluídas + ${EM_CURSO.length} em curso.`);
  console.log('Contas de apoio: inspetor@stante.local e representante@stante.local (senha: SEED_DEMO_SENHA).');
  console.log('Dica: gere um parecer da Sentinela agora, para ele já estar no histórico caso a IA falhe na reunião.');
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
