// src/auth/gates.js
// Definiciones de feature gating por tier (free / pro)
// CommonJS - Node.js / Electron main process

/** Limite de perfiles para el plan gratuito */
const FREE_PROFILE_LIMIT = 50;

/**
 * Mapa de funcionalidades y el tier minimo requerido.
 * 'free' = disponible en todos los planes
 * 'pro'  = requiere suscripcion Pro
 */
const FEATURE_TIERS = {
  // ─── Funciones FREE (automatizacion basica) ─────────────────
  'auto:like':            'free',
  'auto:follow':          'free',
  'auto:unfollow':        'free',
  'auto:stories':         'free',
  'auto:like-hashtag':    'free',
  'auto:like-feed':       'free',
  'auto:like-explore':    'free',
  'auto:watch-reels':     'free',
  'auto:follow-hashtag':  'free',
  'auto:visit':           'free',

  // ─── Funciones PRO (automatizacion avanzada) ────────────────
  'auto:comment':             'pro',
  'auto:send-dm':             'pro',
  'auto:extract-followers':   'pro',

  // ─── Funciones PRO (scraping) ───────────────────────────────
  'scrape:profiles':          'pro',
  'scrape:hashtag-emails':    'pro',
  'scrape:followers-data':    'pro',

  // ─── Funciones PRO (programador) ────────────────────────────
  'scheduler:create':         'pro',

  // ─── Funciones PRO (herramientas) ───────────────────────────
  'warmup:start':             'pro',
  'shadowban:check':          'pro',
};

/**
 * Verifica si una funcionalidad requiere el plan Pro.
 * @param {string} feature - Nombre de la funcionalidad (ej: 'auto:comment')
 * @returns {boolean} true si es una funcion Pro
 */
function isProFeature(feature) {
  const tier = FEATURE_TIERS[feature];
  if (!tier) {
    console.warn(`[Gates] Funcionalidad desconocida: "${feature}". Tratada como PRO por seguridad.`);
    return true; // Por seguridad, funcionalidades desconocidas se tratan como Pro
  }
  return tier === 'pro';
}

/**
 * Lanza un error si el usuario no tiene el tier necesario para la funcionalidad.
 * @param {'free'|'pro'} cachedTier - Tier actual del usuario
 * @param {string} feature - Nombre de la funcionalidad
 * @throws {{ error: 'PRO_REQUIRED', feature: string }} si el tier no es suficiente
 */
function requirePro(currentTier, feature) {
  if (currentTier === 'pro') return;
  if (!isProFeature(feature)) return;
  console.warn(`[Gates] Acceso denegado: "${feature}" requiere plan Pro. Tier actual: ${currentTier}`);
  const err = new Error('PRO_REQUIRED');
  err.code = 'PRO_REQUIRED';
  err.feature = feature;
  throw err;
}

module.exports = {
  FREE_PROFILE_LIMIT,
  FEATURE_TIERS,
  isProFeature,
  requirePro,
};
