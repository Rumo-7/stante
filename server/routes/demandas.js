const express = require('express');
const { all, get, run } = require('../db');
const { uploadAnexos } = require('../upload');

const router = express.Router();

const STATUS_VALIDOS = ['aberta', 'em_andamento', 'concluida'];

const SELECT_BASE = `
  SELECT demandas.*, demandantes.nome AS demandante_nome, fiscais.nome AS fiscal_nome
  FROM demandas
  LEFT JOIN demandantes ON demandantes.id = demandas.demandante_id
  LEFT JOIN fiscais ON fiscais.id = demandas.fiscal_id
`;

function diasParaPrazo(prazo) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const data = new Date(prazo);
  return Math.ceil((data - hoje) / (1000 * 60 * 60 * 24));
}

function statusComputado(demanda) {
  if (demanda.status === 'concluida') return 'concluida';
  const dias = diasParaPrazo(demanda.prazo);
  if (dias < 0) return 'vencida';
  if (dias <= 5) return 'prazo_critico';
  return demanda.status;
}

function serializar(demanda) {
  return {
    id: demanda.id,
    numero: `DEM-${String(demanda.id).padStart(4, '0')}`,
    demandanteId: demanda.demandante_id,
    demandante: demanda.demandante_nome,
    assunto: demanda.assunto,
    fiscalId: demanda.fiscal_id,
    fiscal: demanda.fiscal_nome,
    prazo: demanda.prazo,
    status: statusComputado(demanda),
  };
}

router.get('/', (req, res) => {
  const { de, ate, status, busca, fiscalId } = req.query;

  let demandas = all(`${SELECT_BASE} ORDER BY demandas.prazo ASC`).map(serializar);

  if (de) demandas = demandas.filter((d) => d.prazo >= de);
  if (ate) demandas = demandas.filter((d) => d.prazo <= ate);
  if (status) demandas = demandas.filter((d) => d.status === status);
  if (fiscalId) demandas = demandas.filter((d) => String(d.fiscalId) === String(fiscalId));

  if (busca) {
    const termo = busca.toLowerCase();
    demandas = demandas.filter((d) => [d.numero, d.assunto, d.demandante, d.fiscal]
      .filter(Boolean)
      .some((campo) => campo.toLowerCase().includes(termo)));
  }

  res.json(demandas);
});

router.post('/', uploadAnexos, (req, res) => {
  const { demandanteId, assunto, fiscalId, prazo } = req.body;

  if (!demandanteId || !assunto || !prazo) {
    return res.status(400).json({ erro: 'Preencha demandante, assunto e prazo.' });
  }

  run(
    'INSERT INTO demandas (demandante_id, assunto, fiscal_id, prazo, status) VALUES (?, ?, ?, ?, ?)',
    [demandanteId, assunto, fiscalId || null, prazo, 'aberta']
  );

  const criada = get(`${SELECT_BASE} ORDER BY demandas.id DESC LIMIT 1`);

  (req.files || []).forEach((file) => {
    run(
      'INSERT INTO anexos (demanda_id, nome_original, nome_arquivo, mime_type, tamanho) VALUES (?, ?, ?, ?, ?)',
      [criada.id, file.originalname, file.filename, file.mimetype, file.size]
    );
  });

  res.status(201).json(serializar(criada));
});

router.patch('/:id', (req, res) => {
  const { status, fiscalId } = req.body;
  const campos = [];
  const valores = [];

  if (status !== undefined) {
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ erro: 'Status inválido.' });
    }
    campos.push('status = ?');
    valores.push(status);
  }

  if (fiscalId !== undefined) {
    campos.push('fiscal_id = ?');
    valores.push(fiscalId || null);
  }

  if (!campos.length) {
    return res.status(400).json({ erro: 'Nada para atualizar.' });
  }

  campos.push('updated_at = CURRENT_TIMESTAMP');
  valores.push(req.params.id);

  run(`UPDATE demandas SET ${campos.join(', ')} WHERE id = ?`, valores);

  const atualizada = get(`${SELECT_BASE} WHERE demandas.id = ?`, [req.params.id]);
  if (!atualizada) {
    return res.status(404).json({ erro: 'Demanda não encontrada.' });
  }

  res.json(serializar(atualizada));
});

module.exports = router;
