/**
 * Migración del módulo Anuncios. Solo CREATE TABLE/INDEX IF NOT EXISTS: es idempotente
 * y no toca tablas existentes, así que no rompe bases de datos anteriores.
 * `db` puede ser better-sqlite3 o node:sqlite (solo usa exec/prepare).
 */
const SCHEMA_VERSION = 1;

function migrateAdsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ads_accounts (
      profile_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      name TEXT DEFAULT '',
      status TEXT DEFAULT 'unknown',
      status_code INTEGER DEFAULT NULL,
      disable_reason TEXT DEFAULT '',
      currency TEXT DEFAULT '',
      amount_spent REAL DEFAULT NULL,
      spend_cap REAL DEFAULT NULL,
      payment_method TEXT DEFAULT '',
      business_id TEXT DEFAULT '',
      business_name TEXT DEFAULT '',
      source TEXT DEFAULT '',
      last_read_at DATETIME DEFAULT (datetime('now')),
      PRIMARY KEY (profile_id, account_id)
    );
    CREATE TABLE IF NOT EXISTS ads_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      level TEXT NOT NULL,
      entity_id TEXT DEFAULT '',
      entity_name TEXT DEFAULT '',
      range_key TEXT NOT NULL,
      date_start TEXT DEFAULT '',
      date_stop TEXT DEFAULT '',
      spend REAL DEFAULT 0,
      results REAL DEFAULT NULL,
      cpa REAL DEFAULT NULL,
      roas REAL DEFAULT NULL,
      revenue REAL DEFAULT NULL,
      currency TEXT DEFAULT '',
      range_verified INTEGER DEFAULT 0,
      read_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ads_metrics_acc ON ads_metrics (profile_id, account_id, range_key);
    CREATE TABLE IF NOT EXISTS ads_daily (
      profile_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      date TEXT NOT NULL,
      spend REAL DEFAULT 0,
      results REAL DEFAULT NULL,
      revenue REAL DEFAULT NULL,
      currency TEXT DEFAULT '',
      read_at DATETIME DEFAULT (datetime('now')),
      PRIMARY KEY (profile_id, account_id, date)
    );
    CREATE TABLE IF NOT EXISTS ads_businesses (
      profile_id TEXT NOT NULL,
      business_id TEXT NOT NULL,
      name TEXT DEFAULT '',
      last_read_at DATETIME DEFAULT (datetime('now')),
      PRIMARY KEY (profile_id, business_id)
    );
    CREATE TABLE IF NOT EXISTS ads_bm_items (
      profile_id TEXT NOT NULL,
      business_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      name TEXT DEFAULT '',
      extra TEXT DEFAULT '{}',
      last_read_at DATETIME DEFAULT (datetime('now')),
      PRIMARY KEY (profile_id, business_id, kind, item_id)
    );
    CREATE TABLE IF NOT EXISTS ads_settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );
  `);
  db.prepare("INSERT OR IGNORE INTO ads_settings (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
}

module.exports = { migrateAdsSchema, SCHEMA_VERSION };
