const express = require('express');
const path = require('path');
const fs = require('fs');
const { all, get, run } = require('../db');
const { uploadAnexos, UPLOAD_DIR } = require('../upload');

const router = express.Router();

function serializar(anexo) {
  return {
    id: anexo.id,
    nomeOriginal: anexo.nome_original,
    tamanho: anexo.tamanho,
    criadoEm: anexo.created_at,
  };
}

router.get('/demandas/:demandaId/anexos', (req, res) => {
  const anexos = all(
    'SELECT * FROM anexos WHERE demanda_id = ? ORDER BY id',
    [req.params.demandaId]
  );
  res.json(anexos.map(serializar));
});

router.post('/demandas/:demandaId/anexos', uploadAnexos, (req, res) => {
  const demanda = get('SELECT id FROM demandas WHERE id = ?', [req.params.demandaId]);
  if (!demanda) {
    return res.status(404).json({ erro: 'Demanda não encontrada.' });
  }

  if (!req.files || !req.files.length) {
    return res.status(400).json({ erro: 'Selecione ao menos um arquivo.' });
  }

  req.files.forEach((file) => {
    run(
      'INSERT INTO anexos (demanda_id, nome_original, nome_arquivo, mime_type, tamanho) VALUES (?, ?, ?, ?, ?)',
      [demanda.id, file.originalname, file.filename, file.mimetype, file.size]
    );
  });

  const anexos = all('SELECT * FROM anexos WHERE demanda_id = ? ORDER BY id', [demanda.id]);
  res.status(201).json(anexos.map(serializar));
});

router.get('/anexos/:id/download', (req, res) => {
  const anexo = get('SELECT * FROM anexos WHERE id = ?', [req.params.id]);
  if (!anexo) {
    return res.status(404).json({ erro: 'Anexo não encontrado.' });
  }

  const caminho = path.join(UPLOAD_DIR, anexo.nome_arquivo);
  if (!fs.existsSync(caminho)) {
    return res.status(404).json({ erro: 'Arquivo não encontrado no servidor.' });
  }

  res.download(caminho, anexo.nome_original);
});

router.delete('/anexos/:id', (req, res) => {
  const anexo = get('SELECT * FROM anexos WHERE id = ?', [req.params.id]);
  if (!anexo) {
    return res.status(404).json({ erro: 'Anexo não encontrado.' });
  }

  const caminho = path.join(UPLOAD_DIR, anexo.nome_arquivo);
  if (fs.existsSync(caminho)) fs.unlinkSync(caminho);

  run('DELETE FROM anexos WHERE id = ?', [req.params.id]);
  res.json({ mensagem: 'Anexo removido.' });
});

module.exports = router;
