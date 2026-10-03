import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ErroHttp } from '../../http/erros';
import { MAXIMO_ARQUIVOS, TAMANHO_MAXIMO } from './arquivos';

// Em memória porque o tamanho é limitado (10 MB) e assim nada é gravado em
// disco antes de o arquivo e a requisição terem sido validados.
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO, files: MAXIMO_ARQUIVOS },
});

/** Lê os arquivos do campo "anexos" quando a requisição é multipart; senão, não faz nada. */
export function receberAnexos(req: Request, res: Response, next: NextFunction) {
  if (!req.is('multipart/form-data')) return next();

  multerUpload.array('anexos', MAXIMO_ARQUIVOS)(req, res, (erro: unknown) => {
    if (!erro) return next();
    if (erro instanceof multer.MulterError) {
      if (erro.code === 'LIMIT_FILE_SIZE') {
        return next(new ErroHttp(413, 'Cada arquivo pode ter no máximo 10 MB.'));
      }
      if (erro.code === 'LIMIT_FILE_COUNT') {
        return next(new ErroHttp(400, `Envie no máximo ${MAXIMO_ARQUIVOS} arquivos por vez.`));
      }
      return next(new ErroHttp(400, 'Envio de arquivo inválido.'));
    }
    next(erro);
  });
}

export const arquivosDaRequisicao = (req: Request): Express.Multer.File[] =>
  Array.isArray(req.files) ? req.files : [];
