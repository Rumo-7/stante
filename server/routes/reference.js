const express = require('express');
const { all, get, run } = require('../db');

const router = express.Router();

router.get('/fiscais', (req, res) => {
  res.json(all(`
    SELECT
      fiscais.id,
      fiscais.nome,
      fiscais.especialidade,
      (
        SELECT COUNT(*) FROM demandas
        WHERE demandas.fiscal_id = fiscais.id AND demandas.status != 'concluida'
      ) AS demandas_ativas
    FROM fiscais
    ORDER BY fiscais.nome
  `));
});

router.post('/fiscais', (req, res) => {
  const nome = (req.body.nome || '').trim();
  const especialidade = (req.body.especialidade || '').trim();

  if (!nome) {
    return res.status(400).json({ erro: 'Informe o nome do fiscal.' });
  }

  run('INSERT INTO fiscais (nome, especialidade) VALUES (?, ?)', [nome, especialidade || null]);
  const criado = get('SELECT id, nome, especialidade FROM fiscais ORDER BY id DESC LIMIT 1');
  res.status(201).json({ ...criado, demandas_ativas: 0 });
});

router.get('/demandantes', (req, res) => {
  res.json(all('SELECT id, nome, tipo FROM demandantes ORDER BY id'));
});

router.post('/demandantes', (req, res) => {
  const nome = (req.body.nome || '').trim();

  if (!nome) {
    return res.status(400).json({ erro: 'Informe o nome do órgão.' });
  }

  run('INSERT INTO demandantes (nome, tipo) VALUES (?, ?)', [nome, 'Outro']);
  res.status(201).json(get('SELECT id, nome, tipo FROM demandantes ORDER BY id DESC LIMIT 1'));
});

module.exports = router;
