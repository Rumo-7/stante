const express = require('express');
const path = require('path');
const { initDb } = require('./db');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'State', 'tela_inicial')));
app.use('/api', authRoutes);

app.get('/', (req, res) => {
  res.redirect('/ocorpo.html');
});

initDb().then(() => {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Stante rodando em http://localhost:${PORT}`);
  });
});
