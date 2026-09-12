const express = require('express');
const { all } = require('../db');

const router = express.Router();

const NOMES_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function diasParaPrazo(prazo) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const data = new Date(prazo);
  return Math.ceil((data - hoje) / (1000 * 60 * 60 * 24));
}

function chaveMes(dataStr) {
  const data = new Date(dataStr);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function tendenciaMensal(demandas) {
  const hoje = new Date();
  const janela = [];
  for (let i = 7; i >= 0; i -= 1) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    janela.push({
      chave: `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`,
      mes: NOMES_MESES[data.getMonth()],
    });
  }

  const recebidasPorMes = {};
  const concluidasPorMes = {};

  demandas.forEach((demanda) => {
    const chaveRecebida = chaveMes(demanda.created_at);
    recebidasPorMes[chaveRecebida] = (recebidasPorMes[chaveRecebida] || 0) + 1;

    if (demanda.status === 'concluida') {
      const chaveConcluida = chaveMes(demanda.updated_at);
      concluidasPorMes[chaveConcluida] = (concluidasPorMes[chaveConcluida] || 0) + 1;
    }
  });

  return janela.map(({ chave, mes }) => ({
    mes,
    recebidas: recebidasPorMes[chave] || 0,
    concluidas: concluidasPorMes[chave] || 0,
  }));
}

router.get('/', (req, res) => {
  const demandas = all(`
    SELECT demandas.*, demandantes.nome AS demandante_nome, demandantes.tipo AS demandante_tipo, fiscais.nome AS fiscal_nome
    FROM demandas
    LEFT JOIN demandantes ON demandantes.id = demandas.demandante_id
    LEFT JOIN fiscais ON fiscais.id = demandas.fiscal_id
  `);

  const total = demandas.length;
  let emAndamento = 0;
  let atribuidas = 0;
  let prazoCritico = 0;
  let vencidas = 0;
  let concluidas = 0;

  const porDemandante = {};
  const cargaFiscais = {};
  const prazosProximos = [];

  demandas.forEach((demanda) => {
    const dias = diasParaPrazo(demanda.prazo);

    if (demanda.status === 'concluida') {
      concluidas += 1;
      return;
    }

    if (dias < 0) {
      vencidas += 1;
    } else if (dias <= 5) {
      prazoCritico += 1;
    } else {
      emAndamento += 1;
      if (demanda.fiscal_id) atribuidas += 1;
    }

    const chave = demanda.demandante_tipo || 'Outros';
    porDemandante[chave] = (porDemandante[chave] || 0) + 1;

    if (demanda.fiscal_nome) {
      cargaFiscais[demanda.fiscal_nome] = (cargaFiscais[demanda.fiscal_nome] || 0) + 1;
    }

    if (dias >= 0 && dias <= 30) {
      prazosProximos.push({ ...demanda, dias });
    }
  });

  prazosProximos.sort((a, b) => a.dias - b.dias);

  res.json({
    total,
    emAndamento,
    atribuidas,
    prazoCritico,
    vencidas,
    concluidas,
    porDemandante: Object.entries(porDemandante)
      .map(([tipo, quantidade]) => ({ tipo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade),
    cargaFiscais: Object.entries(cargaFiscais)
      .map(([fiscal, quantidade]) => ({ fiscal, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade),
    prazosProximos: prazosProximos.slice(0, 5).map((demanda) => ({
      numero: `DEM-${String(demanda.id).padStart(4, '0')}`,
      demandante: demanda.demandante_nome,
      assunto: demanda.assunto,
      dias: demanda.dias,
    })),
    tendenciaMensal: tendenciaMensal(demandas),
  });
});

module.exports = router;
