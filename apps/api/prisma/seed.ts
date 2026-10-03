import { PrismaClient, type TipoDemandante } from '@prisma/client';
import { hashSenha } from '../src/auth/senha';

const prisma = new PrismaClient();

const FISCAIS = [
  { nome: 'Carlos Melo', especialidade: 'Segurança do Trabalho' },
  { nome: 'Patrícia Souza', especialidade: 'Saúde Ocupacional' },
  { nome: 'Ricardo Alves', especialidade: 'Ergonomia' },
  { nome: 'Fernanda Costa', especialidade: 'Higiene Ocupacional' },
];

const DEMANDANTES: { nome: string; tipo: TipoDemandante }[] = [
  { nome: 'Ministério Público do Trabalho (MPT)', tipo: 'ministerio_publico' },
  { nome: 'Ministério Público Estadual (MPE)', tipo: 'ministerio_publico' },
  { nome: 'Justiça do Trabalho', tipo: 'judiciario' },
  { nome: 'Sindicatos de Trabalhadores', tipo: 'sindicato' },
  {
    nome: 'Comissão Intersetorial de Saúde do Trabalhador e da Trabalhadora (CISTT)',
    tipo: 'controle_social',
  },
  { nome: 'Auditoria Fiscal do Trabalho (MTE)', tipo: 'fiscalizacao' },
  { nome: 'Hospitais e Unidades de Pronto Atendimento (UPAs)', tipo: 'saude' },
  { nome: 'Unidades Básicas de Saúde (UBS)', tipo: 'saude' },
  { nome: 'Vigilância Sanitária (VISA)', tipo: 'fiscalizacao' },
  { nome: 'Cidadãos e Trabalhadores (via Ouvidoria)', tipo: 'cidadao' },
];

async function criarGestorInicial() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const senha = process.env.SEED_ADMIN_SENHA;
  if (!email || !senha) {
    console.log('SEED_ADMIN_EMAIL/SEED_ADMIN_SENHA não definidos: gestor inicial não criado.');
    return;
  }
  if (senha.length < 8) throw new Error('SEED_ADMIN_SENHA precisa ter ao menos 8 caracteres.');

  // update vazio: rodar o seed de novo não troca a senha de quem já existe
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      nome: process.env.SEED_ADMIN_NOME?.trim() || 'Gestor',
      email,
      senhaHash: await hashSenha(senha),
      perfil: 'gestor',
      status: 'ativo',
    },
  });
  console.log(`Gestor inicial garantido: ${email}`);
}

async function main() {
  // Em produção os fiscais reais são cadastrados pela tela; os de exemplo só servem para desenvolvimento
  if (process.env.SEED_FISCAIS_EXEMPLO !== 'nao' && (await prisma.fiscal.count()) === 0) {
    await prisma.fiscal.createMany({ data: FISCAIS });
  }

  for (const demandante of DEMANDANTES) {
    await prisma.demandante.upsert({
      where: { nome: demandante.nome },
      update: {},
      create: demandante,
    });
  }

  await criarGestorInicial();
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
