// Dados de demonstração para desenvolvimento e para quem for testar o sistema.
//   npm run db:seed:demo
// Só roda em banco sem demandas, para nunca misturar com dados reais.
import { PrismaClient, type StatusDemanda } from '@prisma/client';
import { adicionarDias, hojeNoFuso } from '@stante/shared';
import { hashSenha } from '../src/auth/senha';

const prisma = new PrismaClient();

const hoje = hojeNoFuso();
const dataEm = (dias: number) => new Date(`${adicionarDias(hoje, dias)}T00:00:00.000Z`);
const instanteHa = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

interface DemandaDemo {
  demandante: string;
  assunto: string;
  prazo: number; // dias a partir de hoje (negativo = já passou)
  status: StatusDemanda;
  fiscal: string | null;
  criadaHa: number;
  concluidaHa?: number;
  campo?: boolean;
}

const DEMANDAS: DemandaDemo[] = [
  { demandante: 'Ministério Público do Trabalho (MPT)', assunto: 'Laudo de insalubridade — Frigorífico Boa Carne', prazo: -4, status: 'aberta', fiscal: 'Carlos Melo', criadaHa: 40 },
  { demandante: 'Ministério Público do Trabalho (MPT)', assunto: 'Vistoria por acidente fatal — Construtora Alfa', prazo: 2, status: 'em_andamento', fiscal: 'Patrícia Souza', criadaHa: 12 },
  { demandante: 'Justiça do Trabalho', assunto: 'Perícia ergonômica — Central de atendimento Beta', prazo: 4, status: 'aberta', fiscal: 'Ricardo Alves', criadaHa: 9 },
  { demandante: 'Sindicatos de Trabalhadores', assunto: 'Denúncia de ruído excessivo — Metalúrgica Gama', prazo: 12, status: 'em_andamento', fiscal: 'Fernanda Costa', criadaHa: 20 },
  { demandante: 'Comissão Intersetorial de Saúde do Trabalhador e da Trabalhadora (CISTT)', assunto: 'Relatório de ações do 2º semestre', prazo: 25, status: 'aberta', fiscal: null, criadaHa: 5 },
  { demandante: 'Ministério Público Estadual (MPE)', assunto: 'Investigação de intoxicação — Usina Delta', prazo: 45, status: 'aberta', fiscal: 'Carlos Melo', criadaHa: 3 },
  { demandante: 'Sindicatos de Trabalhadores', assunto: 'Avaliação de EPIs — Frigorífico Kappa', prazo: 60, status: 'aberta', fiscal: 'Ricardo Alves', criadaHa: 15 },
  { demandante: 'Ministério Público do Trabalho (MPT)', assunto: 'Atualização cadastral de empresas', prazo: 1, status: 'em_andamento', fiscal: 'Fernanda Costa', criadaHa: 22 },
  { demandante: 'Auditoria Fiscal do Trabalho (MTE)', assunto: 'Inspeção conjunta — Porto de Suape', prazo: -12, status: 'concluida', fiscal: 'Ricardo Alves', criadaHa: 60, concluidaHa: 20 },
  { demandante: 'Unidades Básicas de Saúde (UBS)', assunto: 'Notificação de LER/DORT — Escola Épsilon', prazo: -30, status: 'concluida', fiscal: 'Patrícia Souza', criadaHa: 75, concluidaHa: 40 },
  { demandante: 'Vigilância Sanitária (VISA)', assunto: 'Parecer sanitário — Lavanderia Zeta', prazo: -50, status: 'concluida', fiscal: 'Fernanda Costa', criadaHa: 100, concluidaHa: 65 },
  { demandante: 'Hospitais e Unidades de Pronto Atendimento (UPAs)', assunto: 'Acidente com material biológico — Hospital Eta', prazo: -8, status: 'concluida', fiscal: 'Carlos Melo', criadaHa: 30, concluidaHa: 10 },
  // Abertas em campo pelo inspetor de demonstração (Patrícia Souza), aguardando validação
  { demandante: 'Cidadãos e Trabalhadores (via Ouvidoria)', assunto: 'Denúncia de trabalho em altura sem proteção — Obra Theta', prazo: 6, status: 'em_analise', fiscal: 'Patrícia Souza', criadaHa: 1, campo: true },
  { demandante: 'Cidadãos e Trabalhadores (via Ouvidoria)', assunto: 'Calor excessivo em fundição — Indústria Iota', prazo: 9, status: 'em_analise', fiscal: 'Patrícia Souza', criadaHa: 0, campo: true },
];

async function criarUsuarioDemo(nome: string, email: string, perfil: 'inspetor' | 'representante', senha: string) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { nome, email, senhaHash: await hashSenha(senha), perfil, status: 'ativo' },
  });
}

async function main() {
  const senha = process.env.SEED_DEMO_SENHA;
  if (!senha || senha.length < 8) {
    throw new Error('Defina SEED_DEMO_SENHA (mínimo 8 caracteres) no apps/api/.env.');
  }
  if ((await prisma.demanda.count()) > 0) {
    console.log('O banco já tem demandas: seed de demonstração ignorado.');
    return;
  }

  const fiscais = new Map((await prisma.fiscal.findMany()).map((f) => [f.nome, f.id]));
  const demandantes = new Map((await prisma.demandante.findMany()).map((d) => [d.nome, d.id]));
  const idFiscal = (nome: string) => fiscais.get(nome) ?? (() => { throw new Error(`Fiscal não encontrado: ${nome} (rode npm run db:seed antes)`); })();
  const idDemandante = (nome: string) => demandantes.get(nome) ?? (() => { throw new Error(`Demandante não encontrado: ${nome} (rode npm run db:seed antes)`); })();

  const inspetor = await criarUsuarioDemo('Patrícia Souza (demo)', 'inspetor@stante.local', 'inspetor', senha);
  await prisma.fiscal.update({ where: { id: idFiscal('Patrícia Souza') }, data: { userId: inspetor.id } });

  const representante = await criarUsuarioDemo('Representante MPT (demo)', 'representante@stante.local', 'representante', senha);
  await prisma.user.update({
    where: { id: representante.id },
    data: { demandanteId: idDemandante('Ministério Público do Trabalho (MPT)') },
  });

  for (const d of DEMANDAS) {
    await prisma.demanda.create({
      data: {
        demandanteId: idDemandante(d.demandante),
        fiscalId: d.fiscal ? idFiscal(d.fiscal) : null,
        assunto: d.assunto,
        prazo: dataEm(d.prazo),
        status: d.status,
        origem: d.campo ? 'campo' : 'planejada',
        criadaPorId: d.campo ? inspetor.id : null,
        createdAt: instanteHa(d.criadaHa),
        concluidaEm: d.concluidaHa !== undefined ? instanteHa(d.concluidaHa) : null,
      },
    });
  }

  console.log(`Demonstração criada: ${DEMANDAS.length} demandas.`);
  console.log('Contas: inspetor@stante.local e representante@stante.local (senha: SEED_DEMO_SENHA).');
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
