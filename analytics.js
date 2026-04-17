import * as XLSX from 'xlsx';

const normalize = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const aliases = {
  pedido: ['pedido', 'pedidoid', 'idpedido', 'order', 'codigo', 'codigopedido'],
  transportadora: ['transportadora', 'carrier', 'operadoralogistica', 'operadora'],
  tipoCobranca: ['tipocobranca', 'tipodecobranca', 'cobranca', 'modalidadecobranca'],
  marketplace: ['marketplace', 'canal', 'canaldevenda', 'origemvenda'],
  uf: ['uf', 'estado', 'ufdestino'],
  cidade: ['cidade', 'destino', 'cidadedestino', 'municipio'],
  tipoOperacao: ['tipooperacao', 'tipo', 'evento', 'statusentrega', 'operacao'],
  cobradoTransportadora: ['valortransportadora', 'cobradotransportadora', 'valorcobrado', 'custofrete', 'custologistico', 'fretecobrado'],
  pagoCliente: ['pagocliente', 'valorpagocliente', 'fretecobradocliente', 'valorcliente', 'receitafrete'],
  valorTabela: ['valortabela', 'tabela', 'valortabelatransportadora', 'preco tabela', 'preco tabela transportadora'],
  divergencia: ['divergencia', 'diferenca', 'diferencatabela', 'valor divergencia'],
};

const metricFields = ['cobradoTransportadora', 'pagoCliente', 'valorTabela', 'divergencia'];

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
}

function detectColumnMap(headers) {
  const normalizedHeaders = headers.map((h) => ({ original: h, normalized: normalize(h) }));
  const result = {};

  Object.entries(aliases).forEach(([target, words]) => {
    const found = normalizedHeaders.find((header) => words.includes(header.normalized));
    if (found) result[target] = found.original;
  });

  return result;
}

export function normalizeRows(rows) {
  if (!rows.length) return [];
  const map = detectColumnMap(Object.keys(rows[0]));

  return rows.map((row, index) => {
    const normalizedRow = {
      pedido: row[map.pedido] ?? `LINHA-${index + 1}`,
      transportadora: row[map.transportadora] ?? 'Não informado',
      tipoCobranca: row[map.tipoCobranca] ?? 'Não informado',
      marketplace: row[map.marketplace] ?? 'Não informado',
      uf: row[map.uf] ?? 'Não informado',
      cidade: row[map.cidade] ?? '',
      tipoOperacao: row[map.tipoOperacao] ?? 'Envio',
      cobradoTransportadora: toNumber(row[map.cobradoTransportadora]),
      pagoCliente: toNumber(row[map.pagoCliente]),
      valorTabela: toNumber(row[map.valorTabela]),
      divergencia: toNumber(row[map.divergencia]),
    };

    const operationLabel = String(normalizedRow.tipoOperacao || '').toLowerCase();
    if (operationLabel.includes('reent')) normalizedRow.tipoOperacao = 'Reentrega';
    else if (operationLabel.includes('devol')) normalizedRow.tipoOperacao = 'Devolução';
    else normalizedRow.tipoOperacao = 'Envio';

    if (!normalizedRow.divergencia && normalizedRow.valorTabela) {
      normalizedRow.divergencia = normalizedRow.cobradoTransportadora - normalizedRow.valorTabela;
    }

    normalizedRow.resultado = normalizedRow.pagoCliente - normalizedRow.cobradoTransportadora;
    normalizedRow.margem = normalizedRow.pagoCliente > 0 ? (normalizedRow.resultado / normalizedRow.pagoCliente) * 100 : -100;
    normalizedRow.isInvalid = ['0', '#N/A', 'Não informado'].includes(String(normalizedRow.marketplace)) || String(normalizedRow.uf) === '#N/A';

    return normalizedRow;
  });
}

export async function parseWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
  return normalizeRows(rows);
}

export function summarize(rows) {
  const receita = rows.reduce((sum, row) => sum + row.pagoCliente, 0);
  const custo = rows.reduce((sum, row) => sum + row.cobradoTransportadora, 0);
  const resultado = receita - custo;
  const divergencia = rows.reduce((sum, row) => sum + row.divergencia, 0);
  const pedidosPrejuizo = rows.filter((row) => row.resultado < 0).length;
  const devolucoes = rows.filter((row) => row.tipoOperacao === 'Devolução').reduce((sum, row) => sum + row.cobradoTransportadora, 0);
  const reentregas = rows.filter((row) => row.tipoOperacao === 'Reentrega').reduce((sum, row) => sum + row.cobradoTransportadora, 0);
  const invalidos = rows.filter((row) => row.isInvalid).length;

  return {
    receita,
    custo,
    resultado,
    margem: receita > 0 ? (resultado / receita) * 100 : 0,
    pedidos: rows.length,
    pedidosPrejuizo,
    percentualPrejuizo: rows.length ? (pedidosPrejuizo / rows.length) * 100 : 0,
    divergencia,
    devolucoes,
    reentregas,
    invalidos,
  };
}

export function groupBy(rows, field) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row[field] || 'Não informado';
    if (!map.has(key)) {
      map.set(key, { nome: key, pedidos: 0, receita: 0, custo: 0, divergencia: 0, prejuizos: 0, devolucoes: 0, reentregas: 0 });
    }
    const bucket = map.get(key);
    bucket.pedidos += 1;
    bucket.receita += row.pagoCliente;
    bucket.custo += row.cobradoTransportadora;
    bucket.divergencia += row.divergencia;
    if (row.resultado < 0) bucket.prejuizos += 1;
    if (row.tipoOperacao === 'Devolução') bucket.devolucoes += 1;
    if (row.tipoOperacao === 'Reentrega') bucket.reentregas += 1;
  });

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      resultado: item.receita - item.custo,
      margem: item.receita > 0 ? ((item.receita - item.custo) / item.receita) * 100 : -100,
      percentualPrejuizo: item.pedidos ? (item.prejuizos / item.pedidos) * 100 : 0,
    }))
    .sort((a, b) => b.resultado - a.resultado);
}

export function buildInsights(rows) {
  const summary = summarize(rows);
  const byCarrier = groupBy(rows, 'transportadora');
  const byUf = groupBy(rows, 'uf');
  const topLossCarrier = [...byCarrier].sort((a, b) => a.resultado - b.resultado)[0];
  const topLossUf = [...byUf].sort((a, b) => a.resultado - b.resultado)[0];

  const insights = [];
  insights.push(summary.resultado >= 0 ? 'A operação está lucrativa no consolidado.' : 'A operação está em prejuízo no consolidado.');
  insights.push(`Pedidos em prejuízo representam ${summary.percentualPrejuizo.toFixed(1)}% da base analisada.`);
  if (topLossCarrier) insights.push(`A transportadora mais crítica é ${topLossCarrier.nome}, com resultado de ${topLossCarrier.resultado.toFixed(2)}.`);
  if (topLossUf) insights.push(`A UF mais pressionada é ${topLossUf.nome}, com resultado de ${topLossUf.resultado.toFixed(2)}.`);
  insights.push(`Devoluções e reentregas drenam ${summary.devolucoes + summary.reentregas} em custo direto.`);
  if (summary.invalidos) insights.push(`Foram encontrados ${summary.invalidos} registros com risco cadastral.`);
  return insights;
}

export function exportRowsToCsv(rows, filename = 'fretes-analitico.csv') {
  const headers = ['pedido', 'transportadora', 'tipoCobranca', 'marketplace', 'uf', 'cidade', 'tipoOperacao', 'cobradoTransportadora', 'pagoCliente', 'valorTabela', 'divergencia', 'resultado', 'margem'];
  const csv = [headers.join(';')]
    .concat(
      rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? '')).join(';'))
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export const formatCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;
