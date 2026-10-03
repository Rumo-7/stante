import bcrypt from 'bcryptjs';

const CUSTO = 12;

export const hashSenha = (senha: string) => bcrypt.hash(senha, CUSTO);
export const confereSenha = (senha: string, hash: string) => bcrypt.compare(senha, hash);

// Usado quando o e-mail não existe, para o login levar o mesmo tempo nos dois
// casos e não revelar quais e-mails estão cadastrados.
export const HASH_FALSO = bcrypt.hashSync('senha-que-nunca-sera-usada', CUSTO);
