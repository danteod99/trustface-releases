// src/auth/supabase.js
// Cliente Supabase singleton para el proceso principal de Electron
// CommonJS - Node.js / Electron main process

const { createClient } = require('@supabase/supabase-js');

// ============================================================
// IMPORTANTE: Reemplaza estos valores con tus credenciales reales de Supabase
// Ve a https://app.supabase.com -> Settings -> API para obtenerlas
// ============================================================
const SUPABASE_URL = 'https://jlxaubqvgjahcsnotvih.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ooYxQ-GHz2mayTFJPIswyA_EAyP_gRi';

let supabaseInstance = null;

/**
 * Retorna la instancia singleton del cliente Supabase.
 * La sesion se persiste manualmente en disco, no via el SDK.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getSupabase() {
  if (!supabaseInstance) {
    console.log('[Auth] Inicializando cliente Supabase...');
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false, // Nosotros manejamos la persistencia en disco
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    console.log('[Auth] Cliente Supabase listo.');
  }
  return supabaseInstance;
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  getSupabase,
};
