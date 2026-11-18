/**
 * Capa Playwright del módulo Anuncios. TODOS los selectores y URLs de Facebook viven aquí.
 * Estrategia: 1) leer las respuestas JSON internas de Ads Manager/Business Manager,
 * 2) si no alcanza, leer el DOM con selectores alternativos, 3) si tampoco, error claro
 * ("no se pudo leer X"). Solo LEE, salvo assignAsset() que escribe accesos (el llamador
 * debe haber pedido confirmación explícita). Nunca registra cookies, tokens ni cuerpos.
 */
const P = require('./ads-parsers');

const URLS = {
  accounts: 'https://adsmanager.facebook.com/adsmanager/manage/accounts',
  campaigns: (act, since, until) => `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act}&date=${since}_${until}`,
  accountOverview: (act) => `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act}`,
  billing: (act) => `https://business.facebook.com/billing_hub/payment_settings?asset_id=${act}`,
  bmSelect: 'https://business.facebook.com/select/',
  bmSettings: (kind, bid) => `https://business.facebook.com/settings/${kind}?business_id=${bid}`,
  bmAsset: (kind, assetId, bid) => `https://business.facebook.com/settings/${kind}/${assetId}?business_id=${bid}`,
};

const BM_PATHS = { ad_account: 'ad-accounts', page: 'pages', person: 'people' };

// Selectores alternativos por dato (el primero que funcione gana). Español e inglés.
const SEL = {
  accountLinks: ['a[href*="act="]', 'a[href*="act_"]', '[role="row"] a[href*="adsmanager"]'],
  rowCandidates: ['[role="row"]', '[role="listitem"]', 'tr', 'li'],
  gridHeaders: ['[role="columnheader"]', 'th'],
  gridRows: ['[role="row"]:has([role="gridcell"])', 'tbody tr', '[role="row"]'],
  gridCells: ['[role="gridcell"]', 'td'],
};

// Botones permitidos al asignar accesos. Cualquier otro texto se rechaza (guarda anti-gasto/publicación).
const ALLOWED_BUTTONS = /^(agregar personas|add people|asignar|assign|guardar cambios|save changes|listo|done|siguiente|next|asignar activos|assign assets)$/i;
const FORBIDDEN_TEXT = /publicar|publish|crear anuncio|create ad|promocionar|boost|agregar fondos|add funds|pagar|pay now|eliminar|remove|delete|quitar|revoke/i;

// ─── Utilidades ───────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
/** Espera humana aleatoria. */
const humanPause = (min = 1200, max = 3500) => sleep(rand(min, max));

class AdsReadError extends Error {
  constructor(message, code, detail) { super(message); this.name = 'AdsReadError'; this.code = code || 'READ_FAILED'; this.detail = detail || null; }
}

const NET_URL_RE = /graph\.facebook\.com|\/api\/graphql|\/ads\/|adsmanager|bulk-route-definitions|\/async\/|business\.facebook\.com\/(?:api|ajax)/i;
const MAX_BODIES = 250;
const MAX_BODY_BYTES = 6 * 1024 * 1024;

/** Empieza a capturar respuestas JSON relevantes. Devuelve { stop(), bodies() }. No guarda URLs ni cabeceras. */
function startCapture(page) {
  const bodies = [];
  let pending = 0;
  const handler = async (resp) => {
    try {
      const url = resp.url();
      if (!NET_URL_RE.test(url) || bodies.length >= MAX_BODIES) return;
      const ct = (resp.headers()['content-type'] || '').toLowerCase();
      if (!/json|javascript|text\/plain|html/.test(ct) && !/graphql|graph\.facebook/.test(url)) return;
      pending++;
      const text = await resp.text();
      if (text && text.length < MAX_BODY_BYTES) {
        const objs = P.parseFbJsonText(text);
        if (objs.length) bodies.push(...objs);
      }
    } catch { /* respuesta ya liberada o sin cuerpo */ } finally { pending = Math.max(0, pending - 1); }
  };
  page.on('response', handler);
  return {
    bodies: () => bodies.slice(),
    async stop() { page.off('response', handler); for (let i = 0; i < 20 && pending > 0; i++) await sleep(150); },
  };
}

async function bodyText(page, timeout = 4000) {
  return page.locator('body').innerText({ timeout }).catch(() => '');
}

/** Detecta checkpoint/captcha/ban/login en la página actual. Devuelve null si todo bien. */
async function checkBlocker(page) {
  return P.detectBlocker(page.url(), await bodyText(page));
}

/**
 * Navega y captura. Reintenta navegación (máx. `retries`) SOLO ante errores de red/timeouts,
 * nunca ante checkpoint/ban/captcha: en ese caso lanza AdsReadError y para.
 */
async function navigateCapture(page, url, { settleMs = [3500, 6500], retries = 2, label = 'página' } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const cap = startCapture(page);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await humanPause(settleMs[0], settleMs[1]);
      const blocker = await checkBlocker(page);
      await cap.stop();
      if (blocker && blocker.type !== 'no_ads_access') {
        throw new AdsReadError(blocker.message, blocker.type.toUpperCase());
      }
      return { json: cap.bodies(), blocker };
    } catch (err) {
      await cap.stop();
      if (err instanceof AdsReadError) throw err;
      lastErr = err;
      if (attempt < retries) await humanPause(4000, 9000);
    }
  }
  throw new AdsReadError(`No se pudo abrir ${label}: ${lastErr ? lastErr.message : 'error de red'}`, 'NAVIGATION_FAILED');
}

async function firstCount(page, selectors) {
  for (const s of selectors) { const n = await page.locator(s).count().catch(() => 0); if (n > 0) return s; }
  return null;
}

// ─── Cuentas de anuncios ──────────────────────────────────────────

async function domAccountItems(page) {
  return page.evaluate((sels) => {
    const out = [];
    for (const s of sels) {
      document.querySelectorAll(s).forEach((a) => {
        const row = a.closest('[role="row"],tr,li,[role="listitem"]') || a;
        out.push({ href: a.getAttribute('href') || '', text: (row.innerText || '').slice(0, 400) });
      });
    }
    return out.slice(0, 300);
  }, SEL.accountLinks).catch(() => []);
}

/** Lee la lista de cuentas de anuncios del perfil. Devuelve { accounts, sources }. */
async function readAdAccounts(page) {
  const { json, blocker } = await navigateCapture(page, URLS.accounts, { label: 'Ads Manager (cuentas)' });
  if (blocker && blocker.type === 'no_ads_access') return { accounts: [], sources: ['sin acceso'], note: blocker.message };
  let accounts = P.extractAdAccounts(json);
  let source = 'json';
  if (!accounts.length) {
    accounts = P.parseAccountsFromDom(await domAccountItems(page));
    source = 'dom';
  }
  if (!accounts.length) {
    throw new AdsReadError('No se pudo leer la lista de cuentas de anuncios (Facebook pudo cambiar la página o el perfil no tiene cuentas).', 'ACCOUNTS_NOT_FOUND');
  }
  return { accounts: accounts.map((a) => ({ ...a, source })), sources: [source] };
}

/** Completa estado/gasto/límite de UNA cuenta abriendo su vista. Los campos que no se leen quedan en null. */
async function readAccountDetail(page, accountId) {
  const { json } = await navigateCapture(page, URLS.accountOverview(accountId), { label: `cuenta ${accountId}` });
  const found = P.extractAdAccounts(json).find((a) => a.account_id === accountId) || null;
  const text = await bodyText(page);
  let status = found ? found.status : 'unknown';
  if (/esta cuenta publicitaria (est[aá] )?(inhabilitada|deshabilitada)|this ad account is disabled/i.test(text)) status = 'disabled';
  else if (status === 'unknown' && /restringid|restricted|se requiere acci[oó]n|action required/i.test(text.slice(0, 6000))) status = 'restricted';
  return { ...(found || { account_id: accountId }), status };
}

/** Intenta leer el método de pago visible en facturación; null si no es visible. */
async function readPaymentMethod(page, accountId) {
  try {
    const { json } = await navigateCapture(page, URLS.billing(accountId), { label: 'facturación', retries: 1 });
    const fromJson = P.extractAdAccounts(json).find((a) => a.account_id === accountId);
    if (fromJson && fromJson.payment_method) return fromJson.payment_method;
    return P.parsePaymentMethod(await bodyText(page));
  } catch (err) {
    if (err instanceof AdsReadError && err.code !== 'NAVIGATION_FAILED') throw err; // checkpoint/ban/captcha: propagar
    return null;
  }
}

// ─── Métricas ─────────────────────────────────────────────────────

async function domGrid(page) {
  return page.evaluate((sel) => {
    const pick = (list, root = document) => { for (const s of list) { const n = root.querySelectorAll(s); if (n.length) return [...n]; } return []; };
    const headers = pick(sel.gridHeaders).map((h) => (h.innerText || '').trim());
    const rows = pick(sel.gridRows).slice(0, 300).map((r) => pick(sel.gridCells, r).map((c) => (c.innerText || '').trim()));
    return { headers, rows: rows.filter((r) => r.length) };
  }, { gridHeaders: SEL.gridHeaders, gridRows: SEL.gridRows, gridCells: SEL.gridCells }).catch(() => ({ headers: [], rows: [] }));
}

/**
 * Lee gasto/resultados/CPA/ROAS de una cuenta en un rango. Devuelve { rows, rangeVerified, source }.
 * rangeVerified=true solo si las fechas de las filas JSON coinciden con el rango pedido.
 */
async function readAccountMetrics(page, accountId, range) {
  const { json } = await navigateCapture(page, URLS.campaigns(accountId, range.since, range.until), { label: `métricas de ${accountId}`, settleMs: [5000, 8000] });
  let rows = P.extractInsights(json);
  let source = 'json';
  if (!rows.length) {
    const grid = await domGrid(page);
    const parsed = P.parseGridRows(grid.headers, grid.rows);
    if (parsed.error && !parsed.rows.length) {
      throw new AdsReadError(`No se pudo leer las métricas de ${accountId}: ${parsed.error}.`, 'METRICS_NOT_FOUND');
    }
    rows = parsed.rows; source = 'dom';
  }
  const dated = rows.filter((r) => r.date_start && r.date_stop);
  const rangeVerified = source === 'json' && dated.length > 0
    && dated.every((r) => r.date_start >= range.since && r.date_stop <= range.until);
  return { rows, rangeVerified, source };
}

// ─── Business Manager ─────────────────────────────────────────────

async function domRows(page) {
  return page.evaluate((cands) => {
    for (const s of cands) {
      const n = [...document.querySelectorAll(s)].map((e) => ({ text: (e.innerText || '').slice(0, 300) })).filter((x) => /\d{5,}|@/.test(x.text));
      if (n.length) return n.slice(0, 400);
    }
    return [];
  }, SEL.rowCandidates).catch(() => []);
}

/** Lista los BMs a los que tiene acceso el perfil. */
async function readBusinesses(page) {
  const { json } = await navigateCapture(page, URLS.bmSelect, { label: 'selector de Business Manager' });
  const fromJson = P.extractBusinessItems(json).businesses;
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href*="business_id="]')].map((a) => a.href)).catch(() => []);
  const ids = new Set([...fromJson.map((b) => b.business_id), ...P.extractBusinessIds([page.url(), ...hrefs])]);
  const named = new Map(fromJson.map((b) => [b.business_id, b.name]));
  if (!ids.size) throw new AdsReadError('No se pudo leer ningún Business Manager (el perfil puede no tener uno).', 'BM_NOT_FOUND');
  return [...ids].map((id) => ({ business_id: id, name: named.get(id) || null }));
}

/** Lee cuentas de anuncios, páginas y personas de un BM. */
async function readBusinessAssets(page, businessId) {
  const items = [];
  const errors = [];
  for (const kind of ['ad_account', 'page', 'person']) {
    try {
      const { json } = await navigateCapture(page, URLS.bmSettings(BM_PATHS[kind], businessId), { label: `${BM_PATHS[kind]} del BM`, settleMs: [4000, 7000] });
      let found = P.extractBusinessItems(json).items.filter((i) => i.kind === kind);
      if (!found.length) found = P.parseBusinessListText(kind, await domRows(page));
      if (!found.length) errors.push(`no se pudo leer ${BM_PATHS[kind]}`);
      items.push(...found);
    } catch (err) {
      if (err instanceof AdsReadError && ['CHECKPOINT', 'CAPTCHA', 'BANNED', 'LOGIN'].includes(err.code)) throw err;
      errors.push(`${BM_PATHS[kind]}: ${err.message}`);
    }
    await humanPause(2500, 6000);
  }
  return { items, errors };
}

// ─── ESCRITURA: asignar un activo a una persona (requiere confirmación previa) ───

const ACCESS_LABELS = {
  ad_account: { manage: /administrar cuenta publicitaria|manage ad account/i, view: /ver rendimiento|view performance|analizar|analyze/i },
  page: { manage: /control total|full control|administrar p[aá]gina|manage page/i, view: /ver rendimiento|view performance|analizar|analyze/i },
};

async function clickAllowed(page, nameRe, what) {
  const loc = page.getByRole('button', { name: nameRe }).first();
  if (!(await loc.count().catch(() => 0))) throw new AdsReadError(`No se encontró el botón "${what}" (Facebook pudo cambiar la interfaz). No se hizo ningún cambio.`, 'UI_CHANGED');
  const label = ((await loc.innerText().catch(() => '')) || '').trim();
  if (FORBIDDEN_TEXT.test(label) || !ALLOWED_BUTTONS.test(label)) throw new AdsReadError(`Botón no permitido: "${label}". Operación abortada.`, 'FORBIDDEN_CLICK');
  await loc.click({ timeout: 8000 });
  await humanPause(1500, 3200);
}

/**
 * Da acceso a una persona existente del BM sobre una cuenta de anuncios o página.
 * Solo administra accesos: no crea anuncios ni toca pagos. Verifica releyendo la ficha.
 */
async function assignAsset(page, { businessId, kind, assetId, personName, access = 'view' }) {
  if (!['ad_account', 'page'].includes(kind)) throw new AdsReadError('Solo se pueden asignar cuentas de anuncios o páginas.', 'BAD_KIND');
  const url = URLS.bmAsset(BM_PATHS[kind], assetId, businessId);
  await navigateCapture(page, url, { label: 'ficha del activo', settleMs: [4000, 7000] });
  await clickAllowed(page, /agregar personas|add people/i, 'Agregar personas');
  // Elegir persona por nombre/correo en la lista del diálogo
  const dialog = page.getByRole('dialog').first();
  const row = dialog.getByText(personName, { exact: false }).first();
  if (!(await row.count().catch(() => 0))) throw new AdsReadError(`La persona "${personName}" no aparece en el BM. Debe existir primero en Personas. No se hizo ningún cambio.`, 'PERSON_NOT_FOUND');
  await row.click({ timeout: 8000 });
  await humanPause(1200, 2600);
  const levelRe = ACCESS_LABELS[kind][access === 'manage' ? 'manage' : 'view'];
  const toggle = dialog.getByText(levelRe).first();
  if (!(await toggle.count().catch(() => 0))) throw new AdsReadError('No se encontró el nivel de acceso pedido en el diálogo. No se hizo ningún cambio.', 'UI_CHANGED');
  await toggle.click({ timeout: 8000 });
  await humanPause(1000, 2200);
  const dialogText = await dialog.innerText({ timeout: 3000 }).catch(() => '');
  if (FORBIDDEN_TEXT.test(dialogText) && /fondos|funds|pago|payment/i.test(dialogText)) {
    throw new AdsReadError('El diálogo menciona pagos o fondos. Operación abortada por seguridad.', 'FORBIDDEN_CLICK');
  }
  await clickAllowed(page, /^(asignar|assign|guardar cambios|save changes)$/i, 'Asignar');
  await clickAllowed(page, /^(listo|done)$/i, 'Listo').catch(() => {}); // el cierre es opcional
  // Verificación
  await navigateCapture(page, url, { label: 'verificación', settleMs: [3000, 5000] });
  const verified = (await bodyText(page, 5000)).toLowerCase().includes(String(personName).toLowerCase());
  return { verified };
}

module.exports = {
  URLS, SEL, AdsReadError, humanPause, sleep, rand,
  navigateCapture, checkBlocker,
  readAdAccounts, readAccountDetail, readPaymentMethod, readAccountMetrics,
  readBusinesses, readBusinessAssets, assignAsset,
};
