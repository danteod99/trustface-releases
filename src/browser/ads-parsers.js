/**
 * Parsers PUROS del módulo Anuncios (sin Playwright ni Electron).
 * Se alimentan con JSON capturado de las respuestas internas de Ads Manager /
 * Business Manager, o con texto del DOM como alternativa. Así se pueden probar
 * sin cuentas reales. Nunca registran contenido de las respuestas.
 */

// ─── JSON de respuestas de red ─────────────────────────────────────

/** Quita prefijos anti-hijacking de Facebook y devuelve 0..n objetos JSON (GraphQL puede venir en varias líneas). */
function parseFbJsonText(text) {
  if (!text || typeof text !== 'string') return [];
  let t = text.trim();
  if (t.startsWith('for (;;);')) t = t.slice(9).trim();
  if (t.startsWith(")]}'")) t = t.slice(4).trim();
  const out = [];
  try { out.push(JSON.parse(t)); return out; } catch { /* probar por líneas */ }
  for (const line of t.split('\n')) {
    const l = line.trim();
    if (!l || (l[0] !== '{' && l[0] !== '[')) continue;
    try { out.push(JSON.parse(l)); } catch { /* ignorar línea no JSON */ }
  }
  return out;
}

/** Recorre recursivamente cualquier objeto/array. visitor(obj) devuelve false para no descender. */
function walk(node, visitor, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 40) return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visitor, depth + 1); return; }
  if (visitor(node) === false) return;
  for (const k of Object.keys(node)) walk(node[k], visitor, depth + 1);
}

// ─── Números y dinero ──────────────────────────────────────────────

/** Convierte "1,234.50", "1.234,50", "S/ 12,5", "1 234" en número. Devuelve null si no hay número. */
function parseNumber(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = String(input).replace(/[^\d.,\-]/g, '');
  if (!/\d/.test(s)) return null;
  let neg = false;
  if (s.startsWith('-')) { neg = true; }
  s = s.replace(/-/g, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = s.split(sep);
    if (parts.length > 2) s = parts.join('');                       // 1.234.567
    else if (parts[1].length === 3 && parts[0].length >= 1 && parts[0] !== '0') s = parts.join(''); // 1,234 -> miles
    else s = parts.join('.');
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const CURRENCY_SYMBOLS = [
  [/S\/\.?|PEN/i, 'PEN'], [/US\$|USD/i, 'USD'], [/€|EUR/i, 'EUR'], [/MXN|MX\$/i, 'MXN'],
  [/COP/i, 'COP'], [/CLP/i, 'CLP'], [/ARS/i, 'ARS'], [/BRL|R\$/i, 'BRL'], [/GBP|£/i, 'GBP'],
];

/** "S/ 1,234.50" -> { amount: 1234.5, currency: 'PEN' } */
function parseMoney(input) {
  if (input === null || input === undefined) return { amount: null, currency: null };
  const s = String(input);
  let currency = null;
  for (const [re, code] of CURRENCY_SYMBOLS) if (re.test(s)) { currency = code; break; }
  if (!currency && /\$/.test(s)) currency = 'USD';
  return { amount: parseNumber(s), currency };
}

/** Los campos amount_spent / spend_cap de Graph vienen en unidades menores (centavos). */
function minorToMajor(v, currency) {
  const n = parseNumber(v);
  if (n === null) return null;
  const zeroDecimal = ['CLP', 'JPY', 'KRW', 'COP', 'VND'].includes(String(currency || '').toUpperCase());
  return zeroDecimal ? n : n / 100;
}

// ─── Estados de cuenta de anuncios ────────────────────────────────

const ACCOUNT_STATUS_CODES = {
  1: 'active', 2: 'disabled', 3: 'restricted', 7: 'restricted', 8: 'restricted',
  9: 'restricted', 100: 'disabled', 101: 'disabled', 201: 'active', 202: 'disabled',
};
const ACCOUNT_STATUS_LABELS = {
  active: 'Activa', restricted: 'Restringida', disabled: 'Deshabilitada / baneada', unknown: 'Desconocido',
};
const DISABLE_REASONS = {
  1: 'Política de integridad de anuncios', 2: 'Revisión de propiedad intelectual', 3: 'Riesgo de pago',
  4: 'Cierre por cuenta gris', 5: 'Revisión de actividad fraudulenta', 6: 'Integridad del negocio',
  7: 'Cierre permanente', 8: 'Cuenta de revendedor sin uso', 9: 'Cuenta sin uso',
};

/** Normaliza un estado numérico de Graph o un texto (es/en) a active | restricted | disabled | unknown. */
function normalizeAccountStatus(value) {
  if (value === null || value === undefined || value === '') return 'unknown';
  if (typeof value === 'number' || /^\d+$/.test(String(value))) return ACCOUNT_STATUS_CODES[Number(value)] || 'unknown';
  const t = String(value).toLowerCase();
  if (/disabled|inhabilitad|deshabilitad|banead|cerrad|closed|suspend|pending[_ ]closure|cierre/.test(t)) return 'disabled';
  if (/restrict|restring|unsettled|grace|risk[_ ]review|revisi[oó]n|pago pendiente|settlement|acci[oó]n requerida|action required/.test(t)) return 'restricted';
  if (/active|activa|en funcionamiento|any_active/.test(t)) return 'active';
  return 'unknown';
}

// ─── Cuentas de anuncios (JSON) ───────────────────────────────────

function cleanActId(v) {
  if (v === null || v === undefined) return null;
  const m = String(v).match(/(?:act_)?(\d{5,})/);
  return m ? m[1] : null;
}

function pick(obj, keys) {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  return null;
}

/** Busca objetos con forma de AdAccount en cualquier JSON capturado. Fusiona duplicados por account_id. */
function extractAdAccounts(jsonObjects) {
  const byId = new Map();
  for (const root of jsonObjects || []) {
    walk(root, (o) => {
      const idRaw = pick(o, ['account_id', 'adAccountID', 'ad_account_id']) ?? (typeof o.id === 'string' && o.id.startsWith('act_') ? o.id : null)
        ?? (o.__typename === 'AdAccount' ? o.id : null);
      const id = cleanActId(idRaw);
      if (!id) return true;
      const hasSignal = o.account_status !== undefined || o.name !== undefined || o.amount_spent !== undefined
        || o.spend_cap !== undefined || o.currency !== undefined || o.__typename === 'AdAccount';
      if (!hasSignal) return true;
      const cur = byId.get(id) || { account_id: id };
      const currency = pick(o, ['currency']) || cur.currency || null;
      const biz = o.business || o.owner_business || o.business_manager || null;
      const fund = o.funding_source_details || o.funding_source || null;
      const merged = {
        ...cur,
        account_id: id,
        name: pick(o, ['name', 'account_name']) || cur.name || null,
        status_code: o.account_status !== undefined ? Number(o.account_status) : (cur.status_code ?? null),
        disable_reason_code: o.disable_reason !== undefined ? Number(o.disable_reason) : (cur.disable_reason_code ?? null),
        currency,
        amount_spent: o.amount_spent !== undefined ? minorToMajor(o.amount_spent, currency) : (cur.amount_spent ?? null),
        spend_cap: o.spend_cap !== undefined && String(o.spend_cap) !== '0' ? minorToMajor(o.spend_cap, currency) : (cur.spend_cap ?? null),
        payment_method: (fund && (fund.display_string || fund.display_name || fund.type)) || cur.payment_method || null,
        business_id: (biz && biz.id) || cur.business_id || null,
        business_name: (biz && biz.name) || cur.business_name || null,
      };
      merged.status = merged.status_code !== null && !Number.isNaN(merged.status_code)
        ? normalizeAccountStatus(merged.status_code) : (cur.status || 'unknown');
      merged.disable_reason = merged.disable_reason_code ? (DISABLE_REASONS[merged.disable_reason_code] || `Código ${merged.disable_reason_code}`) : (cur.disable_reason || null);
      byId.set(id, merged);
      return true;
    });
  }
  return [...byId.values()];
}

/** Alternativa por DOM: items = [{ href, text }] de elementos que enlazan a act=ID. */
function parseAccountsFromDom(items) {
  const byId = new Map();
  for (const it of items || []) {
    const id = cleanActId((String(it.href || '').match(/[?&]act=(\d+)/) || [])[1] || (String(it.href || '').match(/act_(\d+)/) || [])[1]
      || (String(it.text || '').match(/(?:ID|Id)[^\d]{0,12}(\d{8,})/) || [])[1]);
    if (!id) continue;
    const text = String(it.text || '').replace(/\s+/g, ' ').trim();
    const cur = byId.get(id) || { account_id: id };
    const bizId = (String(it.href || '').match(/[?&]business_id=(\d+)/) || [])[1];
    const name = text.split(/ID[:\s]/i)[0].trim().slice(0, 120);
    const status = normalizeAccountStatus(text);
    byId.set(id, {
      ...cur,
      name: cur.name || name || null,
      status: status !== 'unknown' ? status : (cur.status || 'unknown'),
      business_id: bizId || cur.business_id || null,
    });
  }
  return [...byId.values()];
}

/** Método de pago visible en texto de facturación ("Visa •••• 4242"). */
function parsePaymentMethod(text) {
  if (!text) return null;
  const m = String(text).match(/(Visa|Mastercard|American Express|Amex|PayPal|Discover|Maestro)(?:\D{0,30}?(\d{4})\b)?/i);
  if (!m) return null;
  return m[2] ? `${m[1]} •••• ${m[2]}` : m[1];
}

// ─── Métricas (insights) ──────────────────────────────────────────

const RESULT_TYPES = [
  'omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase',
  'lead', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead_grouped',
  'onsite_conversion.messaging_conversation_started_7d', 'complete_registration', 'link_click',
];
const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'];

function actionValue(list, types) {
  if (!Array.isArray(list)) return null;
  for (const t of types) {
    const f = list.find((a) => a && a.action_type === t);
    if (f) { const n = parseNumber(f.value); if (n !== null) return { type: t, value: n }; }
  }
  return null;
}

/** Calcula gasto, resultados, CPA y ROAS de una fila de insights en formato Graph. */
function computeMetrics(row) {
  const spend = parseNumber(row.spend) ?? 0;
  let results = null; let resultType = null;
  if (row.results !== undefined && typeof row.results !== 'object') results = parseNumber(row.results);
  if (results === null) {
    const r = actionValue(row.actions, RESULT_TYPES);
    if (r) { results = r.value; resultType = r.type; }
  }
  let revenue = null;
  const av = actionValue(row.action_values, PURCHASE_TYPES);
  if (av) revenue = av.value;
  let roas = null;
  if (Array.isArray(row.purchase_roas) && row.purchase_roas.length) roas = parseNumber(row.purchase_roas[0].value);
  else if (row.purchase_roas !== undefined && typeof row.purchase_roas !== 'object') roas = parseNumber(row.purchase_roas);
  if (roas === null && revenue !== null && spend > 0) roas = revenue / spend;
  if (revenue === null && roas !== null) revenue = roas * spend;
  const cpa = results && results > 0 ? spend / results : null;
  return { spend, results, result_type: resultType, cpa, roas, revenue };
}

/** Extrae filas de insights (nivel cuenta o campaña) de JSON capturado. */
function extractInsights(jsonObjects) {
  const seen = new Map();
  const add = (row, parent) => {
    if (!row || row.spend === undefined) return;
    const campaignId = row.campaign_id || (parent && (parent.campaign_id || (parent.__typename === 'Campaign' ? parent.id : null) || parent.id));
    const level = campaignId ? 'campaign' : 'account';
    const entityId = String(campaignId || cleanActId(row.account_id) || 'account');
    const key = `${level}|${entityId}|${row.date_start || ''}|${row.date_stop || ''}`;
    const m = computeMetrics(row);
    seen.set(key, {
      level,
      entity_id: entityId,
      entity_name: row.campaign_name || (parent && parent.name) || null,
      account_id: cleanActId(row.account_id) || null,
      date_start: row.date_start || null,
      date_stop: row.date_stop || null,
      currency: row.account_currency || row.currency || null,
      ...m,
    });
  };
  for (const root of jsonObjects || []) {
    walk(root, (o) => {
      if (o.insights && Array.isArray(o.insights.data)) {
        for (const r of o.insights.data) add(r, o);
        return false;
      }
      if (o.spend !== undefined && (o.date_start || o.campaign_id || o.account_id || o.actions || o.impressions !== undefined)) {
        add(o, null);
        return false;
      }
      return true;
    });
  }
  return [...seen.values()];
}

// Alternativa por DOM: cabeceras -> columnas
const HEADER_MAP = [
  ['name', /^(nombre|name|campa[nñ]a|campaign|conjunto|ad set|anuncio|ad)\b/i],
  ['spend', /(importe gastado|amount spent|gasto|spend)/i],
  ['cpa', /(costo por resultado|cost per result|cpa)/i],
  ['roas', /(roas|retorno de la inversi[oó]n|return on ad spend)/i],
  ['results', /^(resultados|results)\b/i],
];

/** headers: string[]; rows: string[][] (celdas por fila). Devuelve filas con spend/results/cpa/roas. */
function parseGridRows(headers, rows) {
  const idx = {};
  (headers || []).forEach((h, i) => {
    const t = String(h || '').trim();
    for (const [key, re] of HEADER_MAP) if (idx[key] === undefined && re.test(t)) { idx[key] = i; break; }
  });
  if (idx.spend === undefined) return { rows: [], error: 'no se encontró la columna de gasto' };
  const out = [];
  for (const cells of rows || []) {
    const name = idx.name !== undefined ? String(cells[idx.name] || '').trim() : '';
    if (/^(resultados de|results from|total)/i.test(name)) continue;
    const money = parseMoney(cells[idx.spend]);
    if (money.amount === null) continue;
    const results = idx.results !== undefined ? parseNumber(cells[idx.results]) : null;
    const cpaCell = idx.cpa !== undefined ? parseMoney(cells[idx.cpa]).amount : null;
    out.push({
      level: 'campaign', entity_id: name || null, entity_name: name || null,
      spend: money.amount, results, cpa: cpaCell !== null ? cpaCell : (results > 0 ? money.amount / results : null),
      roas: idx.roas !== undefined ? parseNumber(cells[idx.roas]) : null,
      revenue: null, currency: money.currency, date_start: null, date_stop: null,
    });
  }
  return { rows: out, error: null };
}

// ─── Rangos de fechas ─────────────────────────────────────────────

const RANGE_KEYS = ['today', 'yesterday', 'last_7d', 'last_30d'];
const RANGE_LABELS = { today: 'Hoy', yesterday: 'Ayer', last_7d: '7 días', last_30d: '30 días' };

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Devuelve { since, until } (YYYY-MM-DD, fecha local). 7d/30d terminan ayer, como Ads Manager. */
function resolveRange(key, now = new Date()) {
  const day = (offset) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d.setDate(d.getDate() + offset); return d; };
  switch (key) {
    case 'today': return { since: fmtDate(day(0)), until: fmtDate(day(0)) };
    case 'yesterday': return { since: fmtDate(day(-1)), until: fmtDate(day(-1)) };
    case 'last_7d': return { since: fmtDate(day(-7)), until: fmtDate(day(-1)) };
    case 'last_30d': return { since: fmtDate(day(-30)), until: fmtDate(day(-1)) };
    default: throw new Error(`Rango no soportado: ${key}`);
  }
}

// ─── Detección de bloqueos (checkpoint, ban, captcha) ─────────────

/** Devuelve { type, message } o null. type: login | checkpoint | captcha | banned | no_ads_access */
function detectBlocker(url, text) {
  const u = String(url || '').toLowerCase();
  const t = String(text || '').slice(0, 20000).toLowerCase();
  if (/\/checkpoint|\/two_step_verification|\/two_factor|login\/device-based|\/recover\/|\/confirmemail/.test(u)
    || /confirma tu identidad|confirm your identity|verifica tu identidad|security check|comprobaci[oó]n de seguridad|we need to confirm it's you|necesitamos confirmar que eres t[uú]/.test(t)) {
    return { type: 'checkpoint', message: 'Facebook pidió verificación (checkpoint). Resuélvela manualmente en el navegador del perfil; no se insistirá.' };
  }
  if (/captcha|confirma que eres una persona|confirm you're a human|prove you're not a robot|demuestra que eres humano/.test(t)
    || /recaptcha|captcha/.test(u)) {
    return { type: 'captcha', message: 'Facebook mostró un captcha. Resuélvelo manualmente; la lectura se detuvo.' };
  }
  if (/inhabilitamos tu cuenta|we disabled your account|your account has been disabled|tu cuenta ha sido inhabilitada|cuenta suspendida|your account is suspended/.test(t)
    || /facebook\.com\/(disabled|suspended)/.test(u)) {
    return { type: 'banned', message: 'La cuenta de Facebook del perfil está inhabilitada o suspendida.' };
  }
  if (/\/login(\.php|\/|\?|$)/.test(u) || /[?&]next=.*login/.test(u)
    || /inicia sesi[oó]n en facebook|log in to facebook|iniciar sesi[oó]n o registrarte/.test(t) && /contrase[nñ]a|password/.test(t) && !/adsmanager/.test(u)) {
    return { type: 'login', message: 'El perfil no tiene sesión iniciada en Facebook.' };
  }
  if (/no tienes acceso a ninguna cuenta publicitaria|you don't have access to any ad accounts|no ad accounts/.test(t)) {
    return { type: 'no_ads_access', message: 'Este perfil no tiene acceso a cuentas de anuncios.' };
  }
  return null;
}

// ─── Business Manager ─────────────────────────────────────────────

/** Extrae ids de BM de URLs/enlaces (business_id=123). */
function extractBusinessIds(strings) {
  const ids = new Set();
  for (const s of strings || []) {
    const m = String(s).match(/business_id=(\d{5,})/g);
    if (m) m.forEach((x) => ids.add(x.split('=')[1]));
  }
  return [...ids];
}

/** Extrae BMs, cuentas de anuncios, páginas y personas de JSON GraphQL/Graph de Business Manager. */
function extractBusinessItems(jsonObjects) {
  const items = new Map();
  const businesses = new Map();
  const put = (kind, id, name, extra) => {
    if (!id) return;
    const key = `${kind}|${id}`;
    const cur = items.get(key) || { kind, item_id: String(id), name: null, extra: {} };
    items.set(key, { ...cur, name: name || cur.name, extra: { ...cur.extra, ...extra } });
  };
  for (const root of jsonObjects || []) {
    walk(root, (o) => {
      const tn = o.__typename;
      if (tn === 'Business' && o.id) businesses.set(String(o.id), { business_id: String(o.id), name: o.name || null });
      for (const [field, kind] of [['owned_ad_accounts', 'ad_account'], ['client_ad_accounts', 'ad_account'], ['owned_pages', 'page'], ['client_pages', 'page'], ['business_users', 'person'], ['system_users', 'person']]) {
        const list = o[field] && (o[field].data || o[field].edges || (Array.isArray(o[field]) ? o[field] : null));
        if (Array.isArray(list)) {
          for (const n of list) {
            const node = n && n.node ? n.node : n;
            if (!node) continue;
            const id = kind === 'ad_account' ? cleanActId(node.account_id || node.id) : node.id;
            put(kind, id, node.name, { role: node.role || node.business_role || undefined, email: node.email || undefined, status: node.account_status !== undefined ? normalizeAccountStatus(node.account_status) : undefined, from: field });
          }
        }
      }
      if (tn === 'AdAccount' && o.id) put('ad_account', cleanActId(o.account_id || o.id), o.name, {});
      else if (tn === 'Page' && o.id) put('page', o.id, o.name, {});
      else if ((tn === 'BusinessUser' || tn === 'BusinessScopedUser' || tn === 'Person') && o.id) put('person', o.id, o.name || o.display_name, { email: o.email || undefined, role: o.role || o.business_role || undefined });
      return true;
    });
  }
  return { businesses: [...businesses.values()], items: [...items.values()] };
}

/** Alternativa por DOM: items = [{ text }] (filas de las listas de Configuración del negocio). */
function parseBusinessListText(kind, rows) {
  const out = [];
  const seen = new Set();
  for (const r of rows || []) {
    const text = String(r.text || r || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const idm = text.match(/(?:ID|Id)[:\s]+(\d{5,})/);
    const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0];
    let id = idm ? idm[1] : null;
    if (kind === 'person' && !id && email) id = email;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = text.split(/(?:ID|Id)[:\s]/)[0].trim().slice(0, 120) || null;
    out.push({ kind, item_id: id, name, extra: email ? { email } : {} });
  }
  return out;
}

module.exports = {
  parseFbJsonText, walk, parseNumber, parseMoney, minorToMajor,
  ACCOUNT_STATUS_LABELS, DISABLE_REASONS, normalizeAccountStatus,
  extractAdAccounts, parseAccountsFromDom, parsePaymentMethod,
  computeMetrics, extractInsights, parseGridRows,
  RANGE_KEYS, RANGE_LABELS, resolveRange, fmtDate,
  detectBlocker, extractBusinessIds, extractBusinessItems, parseBusinessListText, cleanActId,
};
