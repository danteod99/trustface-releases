// Pruebas del módulo Anuncios sin cuentas reales. Ejecutar: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const P = require('../src/browser/ads-parsers');
const { toCsv, cell, METRIC_COLUMNS } = require('../src/browser/ads-csv');
const { migrateAdsSchema } = require('../src/db/ads-schema');
const { createAdsService } = require('../src/browser/ads-service');

test('parseNumber / parseMoney con formatos es/en', () => {
  assert.equal(P.parseNumber('1,234.50'), 1234.5);
  assert.equal(P.parseNumber('1.234,50'), 1234.5);
  assert.equal(P.parseNumber('1,234'), 1234);
  assert.equal(P.parseNumber('12,5'), 12.5);
  assert.equal(P.parseNumber('1.234.567'), 1234567);
  assert.equal(P.parseNumber('—'), null);
  assert.deepEqual(P.parseMoney('S/ 1,234.50'), { amount: 1234.5, currency: 'PEN' });
  assert.deepEqual(P.parseMoney('US$ 12.30'), { amount: 12.3, currency: 'USD' });
  assert.equal(P.minorToMajor('12345', 'USD'), 123.45);
  assert.equal(P.minorToMajor('12345', 'CLP'), 12345);
});

test('parseFbJsonText quita for(;;); y soporta varias líneas', () => {
  assert.deepEqual(P.parseFbJsonText('for (;;);{"a":1}'), [{ a: 1 }]);
  assert.equal(P.parseFbJsonText('{"a":1}\n{"b":2}\nbasura').length, 2);
  assert.deepEqual(P.parseFbJsonText(''), []);
});

test('normalizeAccountStatus: códigos y textos', () => {
  assert.equal(P.normalizeAccountStatus(1), 'active');
  assert.equal(P.normalizeAccountStatus('2'), 'disabled');
  assert.equal(P.normalizeAccountStatus(3), 'restricted');
  assert.equal(P.normalizeAccountStatus('Cuenta inhabilitada'), 'disabled');
  assert.equal(P.normalizeAccountStatus('Restringida'), 'restricted');
  assert.equal(P.normalizeAccountStatus('Activa'), 'active');
  assert.equal(P.normalizeAccountStatus(null), 'unknown');
});

const ACCOUNTS_JSON = {
  data: { viewer: { ad_accounts: { data: [
    { id: 'act_111111111', account_id: '111111111', name: 'Cuenta A', account_status: 1, currency: 'USD', amount_spent: '123456', spend_cap: '500000',
      funding_source_details: { display_string: 'Visa *4242' }, business: { id: '999000111', name: 'BM Uno' } },
    { id: 'act_222222222', account_id: '222222222', name: 'Cuenta B', account_status: 2, disable_reason: 1, currency: 'PEN', amount_spent: '0', spend_cap: '0' },
    { id: 'act_333333333', account_id: '333333333', name: 'Cuenta C', account_status: 7, currency: 'USD', amount_spent: '5000' },
  ] } } },
};

test('extractAdAccounts: estado, gasto, límite, pago y BM', () => {
  const r = P.extractAdAccounts([ACCOUNTS_JSON]);
  assert.equal(r.length, 3);
  const a = r.find((x) => x.account_id === '111111111');
  assert.equal(a.status, 'active'); assert.equal(a.amount_spent, 1234.56); assert.equal(a.spend_cap, 5000);
  assert.equal(a.payment_method, 'Visa *4242'); assert.equal(a.business_id, '999000111'); assert.equal(a.business_name, 'BM Uno');
  const b = r.find((x) => x.account_id === '222222222');
  assert.equal(b.status, 'disabled'); assert.equal(b.spend_cap, null); assert.match(b.disable_reason, /integridad/i);
  assert.equal(r.find((x) => x.account_id === '333333333').status, 'restricted');
});

test('extractAdAccounts fusiona respuestas parciales de la misma cuenta', () => {
  const r = P.extractAdAccounts([{ id: 'act_5550001', account_id: '5550001', name: 'X', currency: 'USD' }, { id: 'act_5550001', account_id: '5550001', account_status: 1, amount_spent: '100' }]);
  assert.equal(r.length, 1); assert.equal(r[0].name, 'X'); assert.equal(r[0].status, 'active'); assert.equal(r[0].amount_spent, 1);
});

test('parseAccountsFromDom (alternativa por DOM)', () => {
  const r = P.parseAccountsFromDom([
    { href: '/adsmanager/manage/campaigns?act=444444444&business_id=777888999', text: 'Mi cuenta ID: 444444444 Activa' },
    { href: '', text: 'Otra cuenta ID: 555555555 Inhabilitada' },
    { href: '/foo', text: 'sin id' },
  ]);
  assert.equal(r.length, 2);
  assert.equal(r[0].status, 'active'); assert.equal(r[0].business_id, '777888999');
  assert.equal(r[1].status, 'disabled');
});

test('parsePaymentMethod', () => {
  assert.equal(P.parsePaymentMethod('Método de pago: Visa •••• 4242'), 'Visa •••• 4242');
  assert.equal(P.parsePaymentMethod('PayPal'), 'PayPal');
  assert.equal(P.parsePaymentMethod('nada por aquí'), null);
});

const INSIGHTS_JSON = { data: [
  { id: 'c1', name: 'Camp Ventas', insights: { data: [{ spend: '100.00', date_start: '2026-11-10', date_stop: '2026-11-16',
    actions: [{ action_type: 'link_click', value: '300' }, { action_type: 'purchase', value: '10' }],
    action_values: [{ action_type: 'purchase', value: '450' }], purchase_roas: [{ action_type: 'omni_purchase', value: '4.5' }] }] } },
  { id: 'c2', name: 'Camp Leads', insights: { data: [{ spend: '50', date_start: '2026-11-10', date_stop: '2026-11-16', actions: [{ action_type: 'lead', value: '5' }] }] } },
  { id: 'c3', name: 'Sin gasto', insights: { data: [{ spend: '0', date_start: '2026-11-10', date_stop: '2026-11-16' }] } },
] };

test('extractInsights + computeMetrics: gasto, resultados, CPA, ROAS', () => {
  const rows = P.extractInsights([INSIGHTS_JSON]);
  assert.equal(rows.length, 3);
  const c1 = rows.find((r) => r.entity_id === 'c1');
  assert.equal(c1.level, 'campaign'); assert.equal(c1.entity_name, 'Camp Ventas');
  assert.equal(c1.spend, 100); assert.equal(c1.results, 10); assert.equal(c1.cpa, 10); assert.equal(c1.roas, 4.5); assert.equal(c1.revenue, 450);
  const c2 = rows.find((r) => r.entity_id === 'c2');
  assert.equal(c2.results, 5); assert.equal(c2.cpa, 10); assert.equal(c2.roas, null);
  const c3 = rows.find((r) => r.entity_id === 'c3');
  assert.equal(c3.cpa, null);
});

test('extractInsights nivel cuenta y ROAS calculado desde action_values', () => {
  const rows = P.extractInsights([{ account_id: '123456789', spend: '200', date_start: '2026-11-17', date_stop: '2026-11-17',
    actions: [{ action_type: 'purchase', value: '4' }], action_values: [{ action_type: 'purchase', value: '800' }] }]);
  assert.equal(rows[0].level, 'account'); assert.equal(rows[0].roas, 4); assert.equal(rows[0].cpa, 50);
});

test('parseGridRows (DOM, es) y error claro sin columna de gasto', () => {
  const r = P.parseGridRows(['Campaña', 'Resultados', 'Costo por resultado', 'Importe gastado', 'ROAS de compras'], [
    ['Camp 1', '12', 'S/ 8.50', 'S/ 102.00', '3.2'], ['Resultados de 2 campañas', '', '', 'S/ 102.00', ''],
  ]);
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].spend, 102); assert.equal(r.rows[0].cpa, 8.5); assert.equal(r.rows[0].roas, 3.2); assert.equal(r.rows[0].currency, 'PEN');
  assert.match(P.parseGridRows(['A', 'B'], [['1', '2']]).error, /gasto/);
});

test('resolveRange', () => {
  const now = new Date(2026, 10, 18);
  assert.deepEqual(P.resolveRange('today', now), { since: '2026-11-18', until: '2026-11-18' });
  assert.deepEqual(P.resolveRange('yesterday', now), { since: '2026-11-17', until: '2026-11-17' });
  assert.deepEqual(P.resolveRange('last_7d', now), { since: '2026-11-11', until: '2026-11-17' });
  assert.deepEqual(P.resolveRange('last_30d', now), { since: '2026-10-19', until: '2026-11-17' });
  assert.throws(() => P.resolveRange('x'));
});

test('detectBlocker: checkpoint, captcha, ban, login, sin acceso', () => {
  assert.equal(P.detectBlocker('https://www.facebook.com/checkpoint/123', '').type, 'checkpoint');
  assert.equal(P.detectBlocker('https://adsmanager.facebook.com/x', 'Confirma tu identidad para continuar').type, 'checkpoint');
  assert.equal(P.detectBlocker('https://www.facebook.com/x', 'Confirma que eres una persona').type, 'captcha');
  assert.equal(P.detectBlocker('https://www.facebook.com/', 'Inhabilitamos tu cuenta').type, 'banned');
  assert.equal(P.detectBlocker('https://www.facebook.com/login/?next=x', '').type, 'login');
  assert.equal(P.detectBlocker('https://adsmanager.facebook.com/adsmanager/manage/campaigns', 'No tienes acceso a ninguna cuenta publicitaria').type, 'no_ads_access');
  assert.equal(P.detectBlocker('https://adsmanager.facebook.com/adsmanager/manage/campaigns', 'Campañas Conjuntos Anuncios'), null);
});

test('Business Manager: JSON y DOM', () => {
  const json = { data: { business: { __typename: 'Business', id: '900100200', name: 'Mi BM',
    owned_ad_accounts: { data: [{ id: 'act_121212121', account_id: '121212121', name: 'AA1', account_status: 1 }] },
    owned_pages: { data: [{ id: '3030303030', name: 'Mi Página' }] },
    business_users: { data: [{ id: '4040404040', name: 'Ana Pérez', email: 'ana@x.com', role: 'ADMIN' }] } } } };
  const r = P.extractBusinessItems([json]);
  assert.deepEqual(r.businesses, [{ business_id: '900100200', name: 'Mi BM' }]);
  assert.deepEqual(r.items.map((i) => i.kind).sort(), ['ad_account', 'page', 'person']);
  assert.equal(r.items.find((i) => i.kind === 'person').extra.email, 'ana@x.com');
  assert.deepEqual(P.extractBusinessIds(['https://business.facebook.com/settings?business_id=123456789', 'x']), ['123456789']);
  const dom = P.parseBusinessListText('page', [{ text: 'Mi Página ID: 5551234567' }, { text: 'sin id' }]);
  assert.equal(dom.length, 1); assert.equal(dom[0].item_id, '5551234567');
  assert.equal(P.parseBusinessListText('person', [{ text: 'Luis luis@x.com' }])[0].item_id, 'luis@x.com');
});

test('CSV: BOM, escape y protección de fórmulas', () => {
  assert.equal(cell('a,b'), '"a,b"');
  assert.equal(cell('di "x"'), '"di ""x"""');
  assert.equal(cell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(cell(-5), '-5'); assert.equal(cell(null), '');
  const csv = toCsv(METRIC_COLUMNS, [{ profile_name: 'P1', account_id: '1', level: 'campaign', entity_name: 'Camp, "uno"', range_key: 'today', spend: 10.5, results: 2, cpa: 5.25, roas: null, currency: 'USD', read_at: '2026-11-18' }]);
  assert.ok(csv.startsWith('﻿Perfil,'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /"Camp, ""uno"""/);
  assert.match(lines[1], /,10.5,2,5.25,,USD,/);
});

// ── Migración SQLite ──
const REAL_DB = path.join(os.homedir(), 'Library', 'Application Support', 'trustface-desktop', 'trustface.db');

function tmpDb() { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ads-mig-')), 't.db'); return f; }
const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);

test('migración: BD nueva, idempotente y sin tocar tablas existentes', () => {
  const f = tmpDb(); const db = new DatabaseSync(f);
  db.exec("CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT); INSERT INTO profiles VALUES ('p1','Uno'); CREATE TABLE action_log (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT, action_type TEXT, target TEXT, count INTEGER DEFAULT 1, created_at DATETIME DEFAULT (datetime('now')));");
  migrateAdsSchema(db); migrateAdsSchema(db); migrateAdsSchema(db);
  for (const t of ['ads_accounts', 'ads_metrics', 'ads_daily', 'ads_businesses', 'ads_bm_items', 'ads_settings']) assert.ok(tables(db).includes(t), t);
  assert.equal(db.prepare('SELECT name FROM profiles').get().name, 'Uno');
  db.close();
});

test('migración sobre COPIA de la BD real (si existe), original intacta', { skip: !fs.existsSync(REAL_DB) }, () => {
  const before = fs.statSync(REAL_DB);
  const copy = tmpDb();
  fs.copyFileSync(REAL_DB, copy);
  for (const ext of ['-wal', '-shm']) if (fs.existsSync(REAL_DB + ext)) fs.copyFileSync(REAL_DB + ext, copy + ext);
  const db = new DatabaseSync(copy);
  const profilesBefore = db.prepare('SELECT COUNT(*) c FROM profiles').get().c;
  const logBefore = db.prepare('SELECT COUNT(*) c FROM action_log').get().c;
  migrateAdsSchema(db); migrateAdsSchema(db);
  assert.ok(tables(db).includes('ads_accounts'));
  assert.equal(db.prepare('SELECT COUNT(*) c FROM profiles').get().c, profilesBefore);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM action_log').get().c, logBefore);
  db.close();
  const after = fs.statSync(REAL_DB);
  assert.equal(after.mtimeMs, before.mtimeMs); assert.equal(after.size, before.size);
});

// ── Servicio: guardado, resumen, CSV y confirmación en dos pasos (sin navegador) ──
function mkService() {
  const db = new DatabaseSync(tmpDb());
  db.exec("CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT); INSERT INTO profiles VALUES ('p1','Perfil Uno'); CREATE TABLE action_log (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT, action_type TEXT, target TEXT, count INTEGER DEFAULT 1, created_at DATETIME DEFAULT (datetime('now')));");
  migrateAdsSchema(db);
  const svc = createAdsService({ getDb: () => db, getActiveBrowsers: () => new Map(), launchBrowser: async () => { throw new Error('no debe abrir navegador'); }, closeBrowser: async () => {}, loadProfile: (id) => ({ id, name: 'x' }), sleep: async () => {} });
  return { db, svc };
}

test('servicio: guardar cuentas, métricas, total de cuenta y resumen diario', () => {
  const { db, svc } = mkService();
  svc._saveAccounts('p1', P.extractAdAccounts([ACCOUNTS_JSON]));
  svc._saveAccounts('p1', [{ account_id: '111111111', status: 'active', source: 'dom' }]); // no pisa datos previos con null
  const accs = svc.listAccounts();
  assert.equal(accs.length, 3);
  const a = accs.find((x) => x.account_id === '111111111');
  assert.equal(a.amount_spent, 1234.56); assert.equal(a.status_label, 'Activa'); assert.equal(a.profile_name, 'Perfil Uno'); assert.ok(a.last_read_at);
  const rows = P.extractInsights([INSIGHTS_JSON]);
  svc._saveMetrics('p1', '111111111', 'today', rows, true, { since: '2026-11-18', until: '2026-11-18' });
  const m = svc.listMetrics('today');
  assert.equal(m.filter((x) => x.level === 'account').length, 1);
  assert.equal(m.find((x) => x.level === 'account').spend, 150);
  assert.equal(svc.listMetrics('today', 'campaign').length, 3);
  svc._saveMetrics('p1', '111111111', 'today', rows, true, { since: '2026-11-18', until: '2026-11-18' }); // reemplaza, no duplica
  assert.equal(svc.listMetrics('today').length, 4);
  const d = db.prepare('SELECT * FROM ads_daily').all();
  assert.equal(d.length, 1); assert.equal(d[0].date, '2026-11-18'); assert.equal(d[0].spend, 150);
  assert.equal(svc.getSettings().concurrency, 1);
  assert.equal(svc.setSettings({ concurrency: 9 }).concurrency, 3);
});

test('servicio: BM guardado y confirmación obligatoria de un solo uso', async () => {
  const { db, svc } = mkService();
  svc._saveBusinesses('p1', [{ business_id: '900100200', name: 'Mi BM' }], { 900100200: [{ kind: 'page', item_id: '1', name: 'Pg', extra: { a: 1 } }] });
  const bm = svc.listBusinesses();
  assert.equal(bm.length, 1); assert.equal(bm[0].items[0].extra.a, 1);
  // sin token válido no se ejecuta nada
  const bad = await svc.executeAssign('inventado');
  assert.equal(bad.ok, false); assert.equal(bad.code, 'NO_CONFIRMATION');
  assert.throws(() => svc.prepareAssign({ profileId: 'p1', businessId: 'b', kind: 'campaign', assetId: '1', personName: 'x' }));
  const prep = svc.prepareAssign({ profileId: 'p1', businessId: '900100200', kind: 'page', assetId: '1', assetName: 'Pg', personName: 'Ana', access: 'manage' });
  assert.match(prep.summary, /MODIFICA permisos/);
  // al ejecutar, el servicio intenta abrir el perfil (falla en la prueba, sin navegador) y registra el intento fallido en action_log
  const r = await svc.executeAssign(prep.token);
  assert.equal(r.ok, false);
  const log = db.prepare('SELECT * FROM action_log').all();
  assert.equal(log.length, 1); assert.equal(log[0].action_type, 'ads-assign-page-failed'); assert.equal(log[0].count, 0);
  assert.equal((await svc.executeAssign(prep.token)).code, 'NO_CONFIRMATION'); // token de un solo uso
});

test('abrir navegadores: varios perfiles, sección elegida, no cierra ni lee, máx. 10', async () => {
  const db = new DatabaseSync(':memory:');
  migrateAdsSchema(db);
  const active = new Map(); const events = []; const opened = []; const closed = [];
  const mkCtx = (id) => ({
    cookies: async () => [{ name: 'c_user' }],
    newPage: async () => ({ goto: async (url) => { opened.push([id, url]); }, bringToFront: async () => {} }),
  });
  const svc = createAdsService({
    getDb: () => db, getActiveBrowsers: () => active,
    launchBrowser: async (p) => { active.set(p.id, { context: mkCtx(p.id) }); },
    closeBrowser: async (id) => { closed.push(id); },
    loadProfile: (id) => (id === 'nope' ? null : { id, name: id }),
    notify: (e) => events.push(e), sleep: async () => {},
  });
  assert.equal(svc.openBrowsers([], 'billing').ok, false); // sin perfiles
  const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
  const r = svc.openBrowsers(ids, 'billing');
  assert.equal(r.ok, true); assert.equal(r.started, 10); assert.equal(r.limited, true);
  for (let i = 0; i < 50 && opened.length < 10; i++) await new Promise((res) => setImmediate(res));
  assert.equal(opened.length, 10);
  assert.ok(opened.every(([, url]) => url.includes('billing_hub')), 'abre la sección pedida');
  assert.deepEqual(closed, [], 'no cierra los navegadores');
  assert.equal(events.filter((e) => e.status === 'opened').length, 10);
  // sección desconocida cae a Ads Manager; perfil inexistente no rompe
  const before = opened.length;
  svc.openBrowsers(['nope', 'p99'], 'inventada');
  for (let i = 0; i < 50 && opened.length < before + 1; i++) await new Promise((res) => setImmediate(res));
  assert.ok(opened.slice(before).every(([, url]) => url.includes('adsmanager')));
  assert.ok(events.some((e) => e.profileId === 'nope' && e.status === 'error'));
  // perfil ya abierto: reutiliza el navegador, solo abre pestaña
  const n = opened.length; svc.openBrowsers(['p0'], 'home');
  for (let i = 0; i < 50 && opened.length < n + 1; i++) await new Promise((res) => setImmediate(res));
  assert.equal(opened[opened.length - 1][1], 'https://www.facebook.com/');
});
