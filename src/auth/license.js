// src/auth/license.js
// Validacion de licencia/tier con cache local y soporte offline
// CommonJS - Node.js / Electron main process

/** Tiempo de vida del cache en memoria (5 minutos en ms) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Dias de gracia para uso offline sin validar contra servidor */
const OFFLINE_GRACE_DAYS = 7;

/** Cache en memoria: { tier, userId, timestamp } */
let cachedTier = null;

/**
 * Obtiene el tier actual del usuario. Primero revisa cache en memoria,
 * luego consulta la tabla 'subscriptions' en Supabase.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<'free'|'pro'>}
 */
async function getCurrentTier(supabase, userId) {
  // Revisar cache en memoria
  if (
    cachedTier &&
    cachedTier.userId === userId &&
    Date.now() - cachedTier.timestamp < CACHE_TTL_MS
  ) {
    console.log(`[Licencia] Tier obtenido desde cache en memoria: ${cachedTier.tier}`);
    return cachedTier.tier;
  }

  try {
    const { data, error } = await supabase
      .from('tm_subscriptions')
      .select('tier, product, expires_at')
      .eq('user_id', userId)
      .in('tier', ['pro'])
      .order('expires_at', { ascending: false });

    if (error) {
      console.error('[Licencia] Error al consultar suscripcion:', error.message);
      return _fallbackToFree(userId);
    }

    if (!data || data.length === 0) {
      console.log('[Licencia] No se encontro suscripcion activa. Tier: free');
      _updateCache(userId, 'free');
      return 'free';
    }

    const now = new Date();
    const APP_ID = 'trustface';
    const validSub = data.find(sub => {
      const expiresAt = new Date(sub.expires_at);
      if (expiresAt < now) return false;
      const product = (sub.product || '').toLowerCase();
      return !product || product === APP_ID || product === 'bundle' || product === 'all';
    });

    if (!validSub) {
      console.log('[Licencia] No hay suscripcion valida para esta app. Tier: free');
      _updateCache(userId, 'free');
      return 'free';
    }

    const tier = 'pro';
    console.log(`[Licencia] Tier obtenido desde Supabase: ${tier}`);
    _updateCache(userId, tier);
    return tier;
  } catch (err) {
    console.error('[Licencia] Error de red al consultar tier:', err.message);
    return _fallbackToFree(userId);
  }
}

/**
 * Guarda el tier en la tabla local SQLite license_cache.
 *
 * @param {object} db - Instancia de better-sqlite3
 * @param {string} userId
 * @param {'free'|'pro'} tier
 * @param {string} expiresAt - Fecha ISO de expiracion de la suscripcion
 */
function saveTierCache(db, userId, tier, expiresAt) {
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS license_cache (
        user_id TEXT PRIMARY KEY,
        tier TEXT NOT NULL,
        expires_at TEXT,
        offline_valid_until TEXT,
        updated_at TEXT
      )
    `).run();

    const offlineValidUntil = new Date();
    offlineValidUntil.setDate(offlineValidUntil.getDate() + OFFLINE_GRACE_DAYS);

    db.prepare(`
      INSERT INTO license_cache (user_id, tier, expires_at, offline_valid_until, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        tier = excluded.tier,
        expires_at = excluded.expires_at,
        offline_valid_until = excluded.offline_valid_until,
        updated_at = excluded.updated_at
    `).run(
      userId,
      tier,
      expiresAt,
      offlineValidUntil.toISOString(),
      new Date().toISOString()
    );

    console.log(`[Licencia] Cache local guardado: tier=${tier}, offline valido hasta ${offlineValidUntil.toISOString()}`);
  } catch (err) {
    console.error('[Licencia] Error al guardar cache local:', err.message);
  }
}

/**
 * Carga el tier desde el cache local SQLite. Verifica offline_valid_until.
 *
 * @param {object} db - Instancia de better-sqlite3
 * @param {string} userId
 * @returns {{tier: 'free'|'pro', expiresAt: string, offlineValidUntil: string}|null}
 */
function loadTierCache(db, userId) {
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS license_cache (
        user_id TEXT PRIMARY KEY,
        tier TEXT NOT NULL,
        expires_at TEXT,
        offline_valid_until TEXT,
        updated_at TEXT
      )
    `).run();

    const row = db.prepare(
      'SELECT tier, expires_at, offline_valid_until FROM license_cache WHERE user_id = ?'
    ).get(userId);

    if (!row) {
      console.log('[Licencia] No se encontro cache local para este usuario.');
      return null;
    }

    // Verificar si el periodo de gracia offline ha expirado
    const now = new Date();
    const offlineLimit = new Date(row.offline_valid_until);

    if (offlineLimit < now) {
      console.warn('[Licencia] El periodo de gracia offline ha expirado. Retornando free.');
      return null;
    }

    console.log(`[Licencia] Cache local cargado: tier=${row.tier}, offline valido hasta ${row.offline_valid_until}`);
    return {
      tier: row.tier,
      expiresAt: row.expires_at,
      offlineValidUntil: row.offline_valid_until,
    };
  } catch (err) {
    console.error('[Licencia] Error al leer cache local:', err.message);
    return null;
  }
}

/**
 * Actualiza el cache en memoria.
 * @param {string} userId
 * @param {'free'|'pro'} tier
 */
function _updateCache(userId, tier) {
  cachedTier = { userId, tier, timestamp: Date.now() };
}

/**
 * Fallback cuando no hay conectividad: retorna free.
 * @param {string} userId
 * @returns {'free'}
 */
function _fallbackToFree(userId) {
  console.warn('[Licencia] Sin conexion, asignando tier free por defecto.');
  _updateCache(userId, 'free');
  return 'free';
}

module.exports = {
  CACHE_TTL_MS,
  OFFLINE_GRACE_DAYS,
  getCurrentTier,
  saveTierCache,
  loadTierCache,
};
