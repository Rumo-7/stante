const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, 'database.sqlite');

let db;

async function initDb() {
  const SQL = await initSqlJs();

  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      perfil TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fiscais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      especialidade TEXT
    )
  `);

  try {
    db.run('ALTER TABLE fiscais ADD COLUMN especialidade TEXT');
  } catch (err) {
    // coluna já existe em bancos criados antes desta versão
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS demandantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS demandas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      demandante_id INTEGER NOT NULL REFERENCES demandantes(id),
      assunto TEXT NOT NULL,
      fiscal_id INTEGER REFERENCES fiscais(id),
      prazo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'aberta',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  seedReferenceData();
  persist();
  return db;
}

function seedReferenceData() {
  const { total: totalFiscais } = get('SELECT COUNT(*) AS total FROM fiscais');
  if (totalFiscais === 0) {
    [
      ['Carlos Melo', 'Segurança do Trabalho'],
      ['Patrícia Souza', 'Saúde Ocupacional'],
      ['Ricardo Alves', 'Ergonomia'],
      ['Fernanda Costa', 'Higiene Ocupacional'],
    ].forEach(([nome, especialidade]) => {
      run('INSERT INTO fiscais (nome, especialidade) VALUES (?, ?)', [nome, especialidade]);
    });
  }

  const { total: totalDemandantes } = get('SELECT COUNT(*) AS total FROM demandantes');
  if (totalDemandantes === 0) {
    [
      'Ministério Público do Trabalho (MPT)',
      'Ministério Público Estadual (MPE)',
      'Justiça do Trabalho',
      'Sindicatos de Trabalhadores',
      'Comissão Intersetorial de Saúde do Trabalhador e da Trabalhadora (CISTT)',
      'Auditoria Fiscal do Trabalho (MTE)',
      'Hospitais e Unidades de Pronto Atendimento (UPAs)',
      'Unidades Básicas de Saúde (UBS)',
      'Vigilância Sanitária (VISA)',
      'Cidadãos e Trabalhadores (via Ouvidoria)',
    ].forEach((nome) => {
      run('INSERT INTO demandantes (nome, tipo) VALUES (?, ?)', [nome, nome]);
    });
  }
}

function persist() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function getDb() {
  return db;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.run(params);
  stmt.free();
  if (db) persist();
}

module.exports = { initDb, persist, getDb, all, get, run };
