// src/auth/device.js
// Huella digital del dispositivo y registro en Supabase
// CommonJS - Node.js / Electron main process

const os = require('os');
const { machineIdSync } = require('node-machine-id');

/** Limite maximo de dispositivos permitidos por usuario */
const MAX_DEVICES = 2;

/**
 * Genera un hash unico del dispositivo usando node-machine-id.
 * @returns {string} Hash SHA-256 del identificador de la maquina
 */
function getDeviceFingerprint() {
  try {
    const fingerprint = machineIdSync({ original: false }); // hash SHA-256
    console.log('[Dispositivo] Huella digital generada correctamente.');
    return fingerprint;
  } catch (err) {
    console.error('[Dispositivo] Error al generar huella digital:', err.message);
    return null;
  }
}

/**
 * Retorna el nombre del equipo (hostname).
 * @returns {string}
 */
function getDeviceName() {
  return os.hostname();
}

/**
 * Registra o actualiza el dispositivo en la tabla 'devices' de Supabase.
 * Verifica que el usuario no exceda el limite de dispositivos.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} fingerprint
 * @param {string} deviceName
 * @returns {Promise<{success: boolean, error: string|null, deviceCount: number}>}
 */
async function registerDevice(supabase, userId, fingerprint, deviceName) {
  try {
    // Verificar si este dispositivo ya esta registrado
    const { data: existing, error: fetchError } = await supabase
      .from('tm_devices')
      .select('id')
      .eq('user_id', userId)
      .eq('fingerprint', fingerprint)
      .maybeSingle();

    if (fetchError) {
      console.error('[Dispositivo] Error al buscar dispositivo:', fetchError.message);
      return { success: false, error: fetchError.message, deviceCount: 0 };
    }

    // Si ya existe, actualizar last_seen
    if (existing) {
      const { error: updateError } = await supabase
        .from('tm_devices')
        .update({
          device_name: deviceName,
          last_seen: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('[Dispositivo] Error al actualizar dispositivo:', updateError.message);
        return { success: false, error: updateError.message, deviceCount: 0 };
      }

      // Contar dispositivos del usuario
      const { count } = await supabase
        .from('tm_devices')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      console.log(`[Dispositivo] Dispositivo existente actualizado. Total: ${count}`);
      return { success: true, error: null, deviceCount: count };
    }

    // Si no existe, contar cuantos dispositivos tiene el usuario
    const { count: currentCount, error: countError } = await supabase
      .from('tm_devices')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      console.error('[Dispositivo] Error al contar dispositivos:', countError.message);
      return { success: false, error: countError.message, deviceCount: 0 };
    }

    if (currentCount >= MAX_DEVICES) {
      console.warn(`[Dispositivo] Limite alcanzado: ${currentCount}/${MAX_DEVICES} dispositivos.`);
      return {
        success: false,
        error: `Limite de dispositivos alcanzado (${MAX_DEVICES}). Desvincula un dispositivo antes de agregar otro.`,
        deviceCount: currentCount,
      };
    }

    // Insertar nuevo dispositivo
    const { error: insertError } = await supabase
      .from('tm_devices')
      .insert({
        user_id: userId,
        fingerprint: fingerprint,
        device_name: deviceName,
        last_seen: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[Dispositivo] Error al registrar dispositivo:', insertError.message);
      return { success: false, error: insertError.message, deviceCount: currentCount };
    }

    const newCount = currentCount + 1;
    console.log(`[Dispositivo] Dispositivo registrado exitosamente. Total: ${newCount}/${MAX_DEVICES}`);
    return { success: true, error: null, deviceCount: newCount };
  } catch (err) {
    console.error('[Dispositivo] Error inesperado:', err.message);
    return { success: false, error: err.message, deviceCount: 0 };
  }
}

module.exports = {
  MAX_DEVICES,
  getDeviceFingerprint,
  getDeviceName,
  registerDevice,
};
