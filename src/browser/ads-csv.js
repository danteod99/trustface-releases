/** Exportación CSV del módulo Anuncios (puro). Incluye BOM para Excel y protección contra fórmulas. */

function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s; // evita inyección de fórmulas
  if (/[",\n\r;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** columns: [{ key, label }]; rows: objetos. */
function toCsv(columns, rows) {
  const head = columns.map((c) => cell(c.label)).join(',');
  const body = (rows || []).map((r) => columns.map((c) => cell(r[c.key])).join(',')).join('\r\n');
  return '\uFEFF' + head + '\r\n' + body + (body ? '\r\n' : '');
}

const METRIC_COLUMNS = [
  { key: 'profile_name', label: 'Perfil' }, { key: 'account_id', label: 'Cuenta de anuncios' },
  { key: 'level', label: 'Nivel' }, { key: 'entity_name', label: 'Nombre' }, { key: 'range_key', label: 'Rango' },
  { key: 'spend', label: 'Gasto' }, { key: 'results', label: 'Resultados' }, { key: 'cpa', label: 'CPA' },
  { key: 'roas', label: 'ROAS' }, { key: 'currency', label: 'Moneda' }, { key: 'read_at', label: 'Leído' },
];
const DAILY_COLUMNS = [
  { key: 'date', label: 'Fecha' }, { key: 'profile_name', label: 'Perfil' }, { key: 'account_id', label: 'Cuenta de anuncios' },
  { key: 'spend', label: 'Gasto' }, { key: 'results', label: 'Resultados' }, { key: 'cpa', label: 'CPA' },
  { key: 'roas', label: 'ROAS' }, { key: 'currency', label: 'Moneda' },
];
const ACCOUNT_COLUMNS = [
  { key: 'profile_name', label: 'Perfil' }, { key: 'account_id', label: 'Cuenta de anuncios' }, { key: 'name', label: 'Nombre' },
  { key: 'status_label', label: 'Estado' }, { key: 'amount_spent', label: 'Gastado' }, { key: 'spend_cap', label: 'Límite de gasto' },
  { key: 'currency', label: 'Moneda' }, { key: 'payment_method', label: 'Método de pago' }, { key: 'business_name', label: 'Business Manager' },
  { key: 'last_read_at', label: 'Última lectura' },
];

module.exports = { toCsv, cell, METRIC_COLUMNS, DAILY_COLUMNS, ACCOUNT_COLUMNS };
