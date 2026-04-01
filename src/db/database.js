const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db = null;

function getDbPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'trustface.db');
}

function initDatabase() {
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fb_user TEXT DEFAULT '',
      fb_pass TEXT DEFAULT '',
      fb_2fa_secret TEXT DEFAULT '',
      fb_email TEXT DEFAULT '',
      fb_email_pass TEXT DEFAULT '',
      fb_logged_in INTEGER DEFAULT 0,
      proxy_type TEXT DEFAULT 'http',
      proxy_host TEXT DEFAULT '',
      proxy_port TEXT DEFAULT '',
      proxy_user TEXT DEFAULT '',
      proxy_pass TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      timezone TEXT DEFAULT 'America/Lima',
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'stopped',
      account_status TEXT DEFAULT 'unknown',
      account_status_msg TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  // Marketplace listings
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      title TEXT NOT NULL,
      price REAL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT '',
      condition TEXT DEFAULT '',
      location TEXT DEFAULT '',
      photos TEXT DEFAULT '[]',
      fb_listing_url TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      posted_at DATETIME DEFAULT (datetime('now')),
      reposted_at DATETIME DEFAULT NULL
    );
  `);

  // Extracted data (group members, marketplace data)
  db.exec(`
    CREATE TABLE IF NOT EXISTS extracted_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_type TEXT NOT NULL,
      source TEXT NOT NULL,
      name TEXT DEFAULT '',
      username TEXT DEFAULT '',
      profile_url TEXT DEFAULT '',
      extra TEXT DEFAULT '',
      extracted_by TEXT DEFAULT '',
      extracted_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(data_type, source, username)
    );
  `);

  // Action log
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target TEXT DEFAULT '',
      count INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  // Scheduled tasks
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      action TEXT NOT NULL,
      config TEXT DEFAULT '{}',
      schedule_time TEXT DEFAULT '08:00',
      schedule_days TEXT DEFAULT '[1,2,3,4,5]',
      profile_ids TEXT DEFAULT '[]',
      enabled INTEGER DEFAULT 1,
      last_run DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  // Settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );
  `);

  // Extracted followers/friends
  db.exec(`
    CREATE TABLE IF NOT EXISTS extracted_followers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_user TEXT NOT NULL,
      username TEXT NOT NULL,
      full_name TEXT DEFAULT '',
      extracted_by TEXT DEFAULT '',
      extracted_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(target_user, username)
    );
  `);

  // Extraction history
  db.exec(`
    CREATE TABLE IF NOT EXISTS extraction_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_user TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      extracted_by TEXT DEFAULT '',
      extracted_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  // Account health checks
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_health (
      profile_id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'unchecked',
      message TEXT DEFAULT '',
      shadowban INTEGER DEFAULT 0,
      shadowban_checks TEXT DEFAULT '{}',
      last_checked DATETIME DEFAULT NULL
    );
  `);

  // Warm-up tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS warmup_status (
      profile_id TEXT PRIMARY KEY,
      active INTEGER DEFAULT 0,
      day INTEGER DEFAULT 0,
      started_at DATETIME DEFAULT NULL,
      today_likes INTEGER DEFAULT 0,
      today_follows INTEGER DEFAULT 0,
      today_stories INTEGER DEFAULT 0,
      today_comments INTEGER DEFAULT 0,
      last_action DATETIME DEFAULT NULL
    );
  `);

  // Scraped data (emails, phones, bios)
  db.exec(`
    CREATE TABLE IF NOT EXISTS scraped_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_user TEXT NOT NULL,
      data_type TEXT NOT NULL,
      value TEXT NOT NULL,
      scraped_by TEXT DEFAULT '',
      scraped_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(target_user, data_type, value)
    );
  `);

  // Followers / Friends extracted
  db.exec(`
    CREATE TABLE IF NOT EXISTS followers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_user TEXT NOT NULL,
      username TEXT NOT NULL,
      full_name TEXT DEFAULT '',
      extracted_by TEXT DEFAULT '',
      extracted_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(target_user, username)
    );
  `);

  // License cache
  db.exec(`
    CREATE TABLE IF NOT EXISTS license_cache (
      user_id TEXT PRIMARY KEY,
      tier TEXT NOT NULL,
      expires_at TEXT,
      offline_valid_until TEXT,
      updated_at TEXT
    );
  `);

  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

module.exports = { initDatabase, getDb };
