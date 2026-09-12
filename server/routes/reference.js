const express = require('express');
const { all, get, run } = require('../db');

const router = express.Router();

router.get('/fiscais', (req, res) => {
  res.json(all('SELECT id, nome FROM fiscais ORDER BY nome'));
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
