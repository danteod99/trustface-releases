/**
 * Orquestación del módulo Anuncios: cola con concurrencia baja, apertura de perfiles,
 * guardado en SQLite y confirmación de escrituras. Recibe sus dependencias (db, launchBrowser…)
 * por parámetro para poder probarse sin Electron.
 *
 * REGLA DURA: nunca crea ni activa anuncios ni gasta dinero. Solo lee y, con confirmación
 * explícita previa (prepareAssign -> executeAssign), administra accesos del Business Manager.
 */
const crypto = require('crypto');
const P = require('./ads-parsers');
const S = require('./ads-scraper');

const DEFAULTS = { concurrency: 1, profileGapMin: 8000, profileGapMax: 20000, maxDetailAccounts: 12 };
const CONFIRM_TTL_MS = 5 * 60 * 1000;
const STOP_CODES = ['CHECKPOINT', 'CAPTCHA', 'BANNED', 'LOGIN'];

function createAdsService(deps) {
  const { getDb, getActiveBrowsers, launchBrowser, closeBrowser, loadProfile, notify = () => {}, sleep = S.sleep } = deps;
  const pendingConfirms = new Map(); // token -> plan (un solo uso, expira)
  const cancelled = { value: false };
  let running = false;

  // ── Ajustes ──
  function getSettings() {
    const rows = getDb().prepare('SELECT key, value FROM ads_settings').all();
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const n = (k, d) => (m[k] !== undefined && m[k] !== '' && Number.isFinite(Number(m[k])) ? Number(m[k]) : d);
    return {
      concurrency: Math.min(3, Math.max(1, n('concurrency', DEFAULTS.concurrency))),
      profileGapMin: n('profileGapMin', DEFAULTS.profileGapMin),
      profileGapMax: n('profileGapMax', DEFAULTS.profileGapMax),
      maxDetailAccounts: n('maxDetailAccounts', DEFAULTS.maxDetailAccounts),
    };
  }
  function setSettings(patch) {
    const db = getDb();
    for (const k of ['concurrency', 'profileGapMin', 'profileGapMax', 'maxDetailAccounts']) {
      if (patch && patch[k] !== undefined && Number.isFinite(Number(patch[k]))) {
        db.prepare('INSERT INTO ads_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(Number(patch[k])));
      }
    }
    return getSettings();
  }

  // ── Sesión del perfil ──
  /** Abre el perfil si no lo está y espera a que haya sesión de Facebook. */
  async function openSession(profileId) {
    const profile = loadProfile(profileId);
    if (!profile) throw new S.AdsReadError('Perfil no encontrado.', 'NO_PROFILE');
    let launchedByUs = false;
    let entry = getActiveBrowsers().get(profileId);
    if (!entry) {
      await launchBrowser(profile);
      launchedByUs = true;
      entry = getActiveBrowsers().get(profileId);
    }
    if (!entry || !entry.context) throw new S.AdsReadError('No se pudo abrir el navegador del perfil.', 'NO_BROWSER');
    // Esperar el login automático (login/2FA/código por correo los hace manager.js). Máx. ~120 s.
    let logged = false;
    for (let i = 0; i < 40 && !cancelled.value; i++) {
      const cookies = await entry.context.cookies('https://www.facebook.com').catch(() => []);
      if (cookies.some((c) => c.name === 'c_user')) { logged = true; break; }
      await sleep(3000);
    }
    if (!logged) {
      if (launchedByUs) await closeBrowser(profileId).catch(() => {});
      throw new S.AdsReadError('El perfil no tiene sesión de Facebook iniciada (revisa login/2FA en la pestaña Perfiles).', 'LOGIN');
    }
    const page = await entry.context.newPage();
    return { page, launchedByUs, profile };
  }

  async function withSession(profileId, fn) {
    let session = null;
    try {
      session = await openSession(profileId);
      return await fn(session.page, session.profile);
    } finally {
      if (session) {
        await session.page.close().catch(() => {});
        if (session.launchedByUs) await closeBrowser(profileId).catch(() => {});
      }
    }
  }

  /** Ejecuta tareas por perfil con concurrencia limitada y pausa aleatoria entre perfiles. */
  async function perProfile(profileIds, taskName, taskFn) {
    if (running) return [{ profile_id: null, ok: false, error: 'Ya hay una operación de Anuncios en curso. Espera a que termine o cancélala.', code: 'BUSY' }];
    running = true; cancelled.value = false;
    const settings = getSettings();
    const queue = [...new Set(profileIds)];
    const total = queue.length;
    const results = [];
    let done = 0;
    const worker = async () => {
      while (queue.length && !cancelled.value) {
        const id = queue.shift();
        notify({ type: 'profile-start', task: taskName, profileId: id, done, total });
        try {
          const data = await withSession(id, taskFn);
          results.push({ profile_id: id, ok: true, ...data });
        } catch (err) {
          // Checkpoint/ban/captcha: se detiene ese perfil y no se insiste
          results.push({ profile_id: id, ok: false, error: err.message || String(err), code: err.code || 'ERROR' });
        }
        done++;
        notify({ type: 'profile-done', task: taskName, profileId: id, done, total, result: results[results.length - 1] });
        if (queue.length && !cancelled.value) await sleep(S.rand(settings.profileGapMin, settings.profileGapMax));
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(settings.concurrency, Math.max(1, total)) }, worker));
    } finally { running = false; }
    if (cancelled.value) results.push({ profile_id: null, ok: false, error: 'Cancelado por el usuario.', code: 'CANCELLED' });
    return results;
  }

  function cancel() { cancelled.value = true; }
  function isRunning() { return running; }

  // ── Persistencia ──
  function saveAccounts(profileId, accounts) {
    const stmt = getDb().prepare(`INSERT INTO ads_accounts
      (profile_id, account_id, name, status, status_code, disable_reason, currency, amount_spent, spend_cap, payment_method, business_id, business_name, source, last_read_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
      ON CONFLICT(profile_id, account_id) DO UPDATE SET
        name = COALESCE(NULLIF(excluded.name,''), ads_accounts.name), status = excluded.status,
        status_code = COALESCE(excluded.status_code, ads_accounts.status_code),
        disable_reason = COALESCE(NULLIF(excluded.disable_reason,''), ads_accounts.disable_reason),
        currency = COALESCE(NULLIF(excluded.currency,''), ads_accounts.currency),
        amount_spent = COALESCE(excluded.amount_spent, ads_accounts.amount_spent),
        spend_cap = COALESCE(excluded.spend_cap, ads_accounts.spend_cap),
        payment_method = COALESCE(NULLIF(excluded.payment_method,''), ads_accounts.payment_method),
        business_id = COALESCE(NULLIF(excluded.business_id,''), ads_accounts.business_id),
        business_name = COALESCE(NULLIF(excluded.business_name,''), ads_accounts.business_name),
        source = excluded.source, last_read_at = datetime('now')`);
    for (const a of accounts) {
      stmt.run(profileId, a.account_id, a.name || '', a.status || 'unknown', a.status_code ?? null, a.disable_reason || '',
        a.currency || '', a.amount_spent ?? null, a.spend_cap ?? null, a.payment_method || '', a.business_id || '', a.business_name || '', a.source || '');
    }
  }

  function saveMetrics(profileId, accountId, rangeKey, rows, rangeVerified, range) {
    const db = getDb();
    db.prepare('DELETE FROM ads_metrics WHERE profile_id = ? AND account_id = ? AND range_key = ?').run(profileId, accountId, rangeKey);
    const ins = db.prepare(`INSERT INTO ads_metrics
      (profile_id, account_id, level, entity_id, entity_name, range_key, date_start, date_stop, spend, results, cpa, roas, revenue, currency, range_verified)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const all = [...rows];
    // Total de cuenta: si el origen no trae nivel cuenta, se suma desde las campañas
    if (!rows.some((r) => r.level === 'account') && rows.length) {
      const any = (k) => rows.some((r) => r[k] !== null && r[k] !== undefined);
      const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
      const spend = sum('spend');
      const results = any('results') ? sum('results') : null;
      const revenue = any('revenue') ? sum('revenue') : null;
      all.unshift({ level: 'account', entity_id: accountId, entity_name: 'Total cuenta', spend, results,
        cpa: results > 0 ? spend / results : null, roas: revenue !== null && spend > 0 ? revenue / spend : null, revenue,
        currency: rows[0].currency, date_start: null, date_stop: null });
    }
    for (const r of all) {
      ins.run(profileId, accountId, r.level, r.entity_id || '', r.entity_name || '', rangeKey, r.date_start || range.since, r.date_stop || range.until,
        r.spend || 0, r.results ?? null, r.cpa ?? null, r.roas ?? null, r.revenue ?? null, r.currency || '', rangeVerified ? 1 : 0);
    }
    // Resumen diario: rango de un solo día, o filas que ya traen su día
    const up = db.prepare(`INSERT INTO ads_daily (profile_id, account_id, date, spend, results, revenue, currency, read_at)
      VALUES (?,?,?,?,?,?,?, datetime('now'))
      ON CONFLICT(profile_id, account_id, date) DO UPDATE SET spend = excluded.spend, results = excluded.results,
        revenue = excluded.revenue, currency = excluded.currency, read_at = datetime('now')`);
    const accRows = all.filter((r) => r.level === 'account');
    if (range.since === range.until && accRows[0]) {
      const r = accRows[0];
      up.run(profileId, accountId, range.since, r.spend || 0, r.results ?? null, r.revenue ?? null, r.currency || '');
    } else {
      for (const r of accRows) {
        if (r.date_start && r.date_start === r.date_stop) up.run(profileId, accountId, r.date_start, r.spend || 0, r.results ?? null, r.revenue ?? null, r.currency || '');
      }
    }
  }

  function saveBusinesses(profileId, businesses, itemsByBusiness) {
    const db = getDb();
    const upBm = db.prepare(`INSERT INTO ads_businesses (profile_id, business_id, name, last_read_at) VALUES (?,?,?, datetime('now'))
      ON CONFLICT(profile_id, business_id) DO UPDATE SET name = COALESCE(NULLIF(excluded.name,''), ads_businesses.name), last_read_at = datetime('now')`);
    for (const b of businesses) {
      upBm.run(profileId, b.business_id, b.name || '');
      const items = itemsByBusiness[b.business_id];
      if (!items || !items.length) continue; // si la lectura falló, se conserva lo anterior
      db.prepare('DELETE FROM ads_bm_items WHERE profile_id = ? AND business_id = ?').run(profileId, b.business_id);
      const ins = db.prepare("INSERT OR REPLACE INTO ads_bm_items (profile_id, business_id, kind, item_id, name, extra, last_read_at) VALUES (?,?,?,?,?,?, datetime('now'))");
      for (const it of items) ins.run(profileId, b.business_id, it.kind, it.item_id, it.name || '', JSON.stringify(it.extra || {}));
    }
  }

  // ── Operaciones de lectura ──
  function refreshAccounts(profileIds) {
    return perProfile(profileIds, 'accounts', async (page, profile) => {
      const settings = getSettings();
      const list = await S.readAdAccounts(page);
      const accounts = list.accounts;
      saveAccounts(profile.id, accounts); // guardado inmediato; el detalle completa después
      // Completar lo que falte (estado/gasto/límite) con la vista de cada cuenta, con tope y pausas
      const need = accounts.filter((a) => a.status === 'unknown' || a.amount_spent == null || a.spend_cap == null).slice(0, settings.maxDetailAccounts);
      const warnings = [];
      for (const a of need) {
        if (cancelled.value) break;
        await S.humanPause(3000, 8000);
        try {
          const d = await S.readAccountDetail(page, a.account_id);
          for (const [k, v] of Object.entries(d)) if (v !== null && v !== undefined && v !== 'unknown') a[k] = v;
          if (!a.payment_method) {
            await S.humanPause(2500, 6000);
            const pm = await S.readPaymentMethod(page, a.account_id);
            if (pm) a.payment_method = pm;
          }
        } catch (err) {
          if (STOP_CODES.includes(err.code)) { saveAccounts(profile.id, accounts); throw err; }
          warnings.push(`${a.account_id}: ${err.message}`);
        }
      }
      saveAccounts(profile.id, accounts);
      return { accounts: accounts.length, warnings, note: list.note || null };
    });
  }

  function refreshMetrics(profileIds, rangeKeys, accountFilter) {
    const keys = (rangeKeys && rangeKeys.length ? rangeKeys : ['today']).filter((k) => P.RANGE_KEYS.includes(k));
    return perProfile(profileIds, 'metrics', async (page, profile) => {
      let accs = getDb().prepare('SELECT account_id, status FROM ads_accounts WHERE profile_id = ?').all(profile.id);
      if (accountFilter && accountFilter.length) accs = accs.filter((a) => accountFilter.includes(a.account_id));
      if (!accs.length) throw new S.AdsReadError('Este perfil no tiene cuentas guardadas. Pulsa "Actualizar" en Cuentas primero.', 'NO_ACCOUNTS');
      const warnings = []; let read = 0;
      for (const a of accs) {
        if (a.status === 'disabled') { warnings.push(`${a.account_id}: deshabilitada, omitida`); continue; }
        for (const key of keys) {
          if (cancelled.value) break;
          const range = P.resolveRange(key);
          await S.humanPause(3500, 9000);
          try {
            const r = await S.readAccountMetrics(page, a.account_id, range);
            saveMetrics(profile.id, a.account_id, key, r.rows, r.rangeVerified, range);
            if (!r.rangeVerified) warnings.push(`${a.account_id}/${key}: no se pudo confirmar que el rango leído sea el pedido (origen: ${r.source})`);
            read++;
          } catch (err) {
            if (STOP_CODES.includes(err.code)) throw err;
            warnings.push(`${a.account_id}/${key}: ${err.message}`);
          }
        }
      }
      return { read, warnings };
    });
  }

  function refreshBusinesses(profileIds) {
    return perProfile(profileIds, 'business', async (page, profile) => {
      const businesses = await S.readBusinesses(page);
      const itemsByBusiness = {}; const warnings = [];
      for (const b of businesses) {
        if (cancelled.value) break;
        await S.humanPause(3000, 7000);
        const r = await S.readBusinessAssets(page, b.business_id);
        itemsByBusiness[b.business_id] = r.items;
        r.errors.forEach((e) => warnings.push(`BM ${b.business_id}: ${e}`));
      }
      saveBusinesses(profile.id, businesses, itemsByBusiness);
      return { businesses: businesses.length, warnings };
    });
  }

  // ── Escritura con confirmación explícita en dos pasos ──
  function prepareAssign({ profileId, businessId, kind, assetId, assetName, personName, access }) {
    if (!profileId || !businessId || !assetId || !personName) throw new Error('Faltan datos para la asignación.');
    if (!['ad_account', 'page'].includes(kind)) throw new Error('Solo se pueden asignar cuentas de anuncios o páginas.');
    const level = access === 'manage' ? 'manage' : 'view';
    for (const [t, p] of pendingConfirms) if (p.expires < Date.now()) pendingConfirms.delete(t);
    const token = crypto.randomBytes(16).toString('hex');
    const summary = `Dar acceso de ${level === 'manage' ? 'ADMINISTRACIÓN' : 'solo lectura/rendimiento'} sobre ${kind === 'page' ? 'la página' : 'la cuenta de anuncios'} `
      + `"${assetName || assetId}" (${assetId}) del Business Manager ${businessId} a "${personName}". Esta acción MODIFICA permisos en Facebook.`;
    pendingConfirms.set(token, { profileId, businessId, kind, assetId, assetName: assetName || '', personName, access: level, summary, expires: Date.now() + CONFIRM_TTL_MS });
    return { token, summary, expiresInSec: CONFIRM_TTL_MS / 1000 };
  }

  async function executeAssign(token) {
    const plan = pendingConfirms.get(token);
    if (!plan) return { ok: false, error: 'La confirmación no existe o ya se usó. Vuelve a pedirla.', code: 'NO_CONFIRMATION' };
    pendingConfirms.delete(token); // un solo uso
    if (plan.expires < Date.now()) return { ok: false, error: 'La confirmación expiró. Vuelve a pedirla.', code: 'EXPIRED' };
    const actionType = plan.kind === 'page' ? 'ads-assign-page' : 'ads-assign-account';
    const target = `${plan.kind}:${plan.assetId} -> ${plan.personName} (${plan.access}) BM:${plan.businessId}`;
    const results = await perProfile([plan.profileId], 'assign', (page) => S.assignAsset(page, plan));
    const r = results[0];
    // Se registra siempre (éxito count=1, intento fallido count=0) para trazabilidad
    try {
      getDb().prepare('INSERT INTO action_log (profile_id, action_type, target, count) VALUES (?, ?, ?, ?)')
        .run(plan.profileId, r && r.ok ? actionType : `${actionType}-failed`, target.slice(0, 300), r && r.ok ? 1 : 0);
    } catch { /* el log no debe romper la operación */ }
    return r.ok ? { ok: true, verified: !!r.verified, summary: plan.summary } : { ok: false, error: r.error, code: r.code };
  }

  // ── Consultas para la UI ──
  function listAccounts() {
    const rows = getDb().prepare(`SELECT a.*, p.name AS profile_name FROM ads_accounts a LEFT JOIN profiles p ON p.id = a.profile_id ORDER BY p.name, a.name`).all();
    return rows.map((r) => ({ ...r, status_label: P.ACCOUNT_STATUS_LABELS[r.status] || P.ACCOUNT_STATUS_LABELS.unknown }));
  }
  function listMetrics(rangeKey, level) {
    return getDb().prepare(`SELECT m.*, p.name AS profile_name FROM ads_metrics m LEFT JOIN profiles p ON p.id = m.profile_id
      WHERE m.range_key = ? AND (? IS NULL OR m.level = ?) ORDER BY p.name, m.account_id, m.level, m.spend DESC`).all(rangeKey, level || null, level || null);
  }
  function dailySummary(days = 30) {
    const since = P.fmtDate(new Date(Date.now() - days * 86400000));
    const rows = getDb().prepare(`SELECT d.*, p.name AS profile_name FROM ads_daily d LEFT JOIN profiles p ON p.id = d.profile_id
      WHERE d.date >= ? ORDER BY d.date DESC, p.name, d.account_id`).all(since);
    return rows.map((r) => ({ ...r, cpa: r.results > 0 ? r.spend / r.results : null, roas: r.revenue != null && r.spend > 0 ? r.revenue / r.spend : null }));
  }
  function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
  function listBusinesses() {
    const db = getDb();
    const bms = db.prepare('SELECT b.*, p.name AS profile_name FROM ads_businesses b LEFT JOIN profiles p ON p.id = b.profile_id ORDER BY p.name, b.name').all();
    const items = db.prepare('SELECT * FROM ads_bm_items').all();
    return bms.map((b) => ({ ...b, items: items.filter((i) => i.profile_id === b.profile_id && i.business_id === b.business_id).map((i) => ({ ...i, extra: safeJson(i.extra) })) }));
  }

  // ── Abrir navegadores a mano (sin leer ni escribir nada en Facebook) ──
  const OPEN_MAX = 10;

  async function openOne(profileId, section) {
    const ev = (status, extra = {}) => notify({ type: 'open-browser', profileId, status, section: section.label, ...extra });
    try {
      const profile = loadProfile(profileId);
      if (!profile) return ev('error', { error: 'Perfil no encontrado.' });
      let entry = getActiveBrowsers().get(profileId);
      if (!entry) {
        ev('launching');
        await launchBrowser(profile);
        entry = getActiveBrowsers().get(profileId);
      }
      if (!entry || !entry.context) return ev('error', { error: 'No se pudo abrir el navegador del perfil.' });
      // Esperar el login automático (máx. ~120 s) sin bloquear a los demás perfiles
      let logged = false;
      for (let i = 0; i < 40; i++) {
        if (!getActiveBrowsers().has(profileId)) return ev('closed');
        const cookies = await entry.context.cookies('https://www.facebook.com').catch(() => []);
        if (cookies.some((c) => c.name === 'c_user')) { logged = true; break; }
        await sleep(3000);
      }
      if (!logged) return ev('no-session', { error: 'Sin sesión de Facebook: el navegador queda abierto para que inicies sesión a mano.' });
      const page = await entry.context.newPage();
      await page.goto(section.url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await page.bringToFront().catch(() => {});
      ev('opened');
    } catch (err) {
      ev('error', { error: err && err.message ? err.message : String(err) });
    }
  }

  /** Abre uno o varios perfiles a la vez (escalonados) y la sección elegida en una pestaña nueva. Los navegadores quedan abiertos. */
  function openBrowsers(profileIds, sectionKey) {
    const section = S.OPEN_SECTIONS[sectionKey] || S.OPEN_SECTIONS.adsmanager;
    const all = [...new Set(profileIds || [])];
    if (!all.length) return { ok: false, error: 'No elegiste ningún perfil.' };
    const ids = all.slice(0, OPEN_MAX);
    (async () => {
      for (let i = 0; i < ids.length; i++) {
        if (i) await sleep(S.rand(2500, 5000));
        openOne(ids[i], section);
      }
    })();
    return { ok: true, started: ids.length, section: section.label, limited: all.length > ids.length, max: OPEN_MAX };
  }

  return {
    openBrowsers,
    getSettings, setSettings, cancel, isRunning,
    refreshAccounts, refreshMetrics, refreshBusinesses,
    prepareAssign, executeAssign,
    listAccounts, listMetrics, dailySummary, listBusinesses,
    _saveAccounts: saveAccounts, _saveMetrics: saveMetrics, _saveBusinesses: saveBusinesses,
  };
}

module.exports = { createAdsService };
