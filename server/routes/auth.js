const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb, persist } = require('../db');

const router = express.Router();

const PERFIS_VALIDOS = ['gestor', 'inspetor', 'representante'];

router.post('/cadastro', async (req, res) => {
  const { nome, email, senha, confirmarSenha, perfil } = req.body;

  if (!nome || !email || !senha || !confirmarSenha || !perfil) {
    return res.status(400).json({ erro: 'Preencha todos os campos.' });
  }

  if (senha !== confirmarSenha) {
    return res.status(400).json({ erro: 'As senhas não coincidem.' });
  }

  if (senha.length < 8) {
    return res.status(400).json({ erro: 'A senha deve ter pelo menos 8 caracteres.' });
  }

  if (!PERFIS_VALIDOS.includes(perfil)) {
    return res.status(400).json({ erro: 'Perfil inválido.' });
  }

  const db = getDb();

  const checkStmt = db.prepare('SELECT id FROM users WHERE email = ?');
  checkStmt.bind([email]);
  const jaExiste = checkStmt.step();
  checkStmt.free();

  if (jaExiste) {
    return res.status(409).json({ erro: 'Este email já está cadastrado.' });
  }

  const senhaHash = await bcrypt.hash(senha, 10);

  const insertStmt = db.prepare(
    'INSERT INTO users (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)'
  );
  insertStmt.run([nome, email, senhaHash, perfil]);
  insertStmt.free();
  persist();

  res.status(201).json({ mensagem: 'Cadastro realizado com sucesso.' });
});

router.get('/perfil/:email', (req, res) => {
  const db = getDb();
  const stmt = db.prepare('SELECT id, nome, email, perfil, created_at FROM users WHERE email = ?');
  stmt.bind([req.params.email]);

  let user = null;
  if (stmt.step()) {
    user = stmt.getAsObject();
  }
  stmt.free();

  if (!user) {
    return res.status(404).json({ erro: 'Usuário não encontrado.' });
  }

  res.json(user);
});

module.exports = router;
