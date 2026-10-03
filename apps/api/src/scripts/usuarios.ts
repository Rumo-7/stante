// Administração de contas pela linha de comando (até existir a tela de usuários).
//   npm run usuarios -- listar
//   npm run usuarios -- aprovar email@exemplo.com
//   npm run usuarios -- bloquear email@exemplo.com
//   npm run usuarios -- vincular-fiscal email@exemplo.com <fiscalId>
//   npm run usuarios -- vincular-demandante email@exemplo.com <demandanteId>
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [comando, emailBruto] = process.argv.slice(2);
  const email = emailBruto?.trim().toLowerCase();

  if (comando === 'listar') {
    const usuarios = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    console.table(
      usuarios.map((u) => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, status: u.status })),
    );
    return;
  }

  if ((comando === 'aprovar' || comando === 'bloquear') && email) {
    const status = comando === 'aprovar' ? 'ativo' : 'bloqueado';
    const resultado = await prisma.user.updateMany({ where: { email }, data: { status } });
    if (resultado.count === 0) throw new Error(`Nenhum usuário com o e-mail ${email}.`);
    if (status === 'bloqueado') {
      await prisma.sessao.deleteMany({ where: { user: { email } } });
    }
    console.log(`${email}: ${status}`);
    return;
  }

  if (comando === 'vincular-fiscal') {
    // O inspetor só enxerga e cria demandas depois de vinculado a um fiscal.
    const fiscalId = Number(process.argv[4]);
    if (!email || !Number.isInteger(fiscalId)) throw new Error('Uso: vincular-fiscal <email> <fiscalId>');
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`Nenhum usuário com o e-mail ${email}.`);
    if (user.perfil !== 'inspetor') throw new Error('Só usuários com perfil inspetor podem ser vinculados a um fiscal.');
    await prisma.fiscal.update({ where: { id: fiscalId }, data: { userId: user.id } });
    console.log(`${email} vinculado ao fiscal ${fiscalId}.`);
    return;
  }

  if (comando === 'vincular-demandante') {
    // O representante só enxerga as demandas do órgão ao qual está vinculado.
    const demandanteId = Number(process.argv[4]);
    if (!email || !Number.isInteger(demandanteId)) throw new Error('Uso: vincular-demandante <email> <demandanteId>');
    const resultado = await prisma.user.updateMany({
      where: { email, perfil: 'representante' },
      data: { demandanteId },
    });
    if (resultado.count === 0) throw new Error(`Nenhum representante com o e-mail ${email}.`);
    console.log(`${email} vinculado ao demandante ${demandanteId}.`);
    return;
  }

  console.log(
    'Uso: npm run usuarios -- listar | aprovar <email> | bloquear <email> | vincular-fiscal <email> <fiscalId> | vincular-demandante <email> <demandanteId>',
  );
  process.exitCode = 1;
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
