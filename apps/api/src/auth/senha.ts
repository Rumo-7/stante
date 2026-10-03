import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

const CUSTO = 12;

export const hashSenha = (senha: string) => bcrypt.hash(senha, CUSTO);
export const confereSenha = (senha: string, hash: string) => bcrypt.compare(senha, hash);

// Usado quando o e-mail não existe, para o login levar o mesmo tempo nos dois
// casos e não revelar quais e-mails estão cadastrados.
export const HASH_FALSO = bcrypt.hashSync('senha-que-nunca-sera-usada', CUSTO);

// Sem 0/O, 1/l/I e afins: a senha provisória costuma ser ditada ou copiada à mão
const ALFABETO_PROVISORIA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Senha provisória de 12 caracteres (cerca de 68 bits), sorteada com gerador criptográfico. */
export function gerarSenhaProvisoria(tamanho = 12): string {
  let senha = '';
  for (let i = 0; i < tamanho; i += 1) {
    senha += ALFABETO_PROVISORIA[randomInt(ALFABETO_PROVISORIA.length)];
  }
  return senha;
}
