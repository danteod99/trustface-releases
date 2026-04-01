// src/auth/session.js
// Persistencia de sesion en disco para Electron (ENCRIPTADA)
// CommonJS - Node.js / Electron main process

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getSessionPath() {
  return path.join(app.getPath('userData'), 'session.enc');
}

function getKeyPath() {
  return path.join(app.getPath('userData'), '.trustmind-key');
}

function getEncryptionKey() {
  const keyPath = getKeyPath();
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath);
  }
  const os = require('os');
  const machineId = [os.hostname(), os.userInfo().username, os.cpus()[0]?.model || '', os.totalmem().toString()].join('|');
  const key = crypto.scryptSync(machineId + crypto.randomBytes(16).toString('hex'), 'trustmind-salt', 32);
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}

let _key = null;
function key() {
  if (!_key) _key = getEncryptionKey();
  return _key;
}

function encryptData(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function decryptData(buffer) {
  const iv = buffer.subarray(0, IV_LENGTH);
  const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Guarda la sesion del usuario en disco (encriptada).
 */
function saveSession(session) {
  try {
    const filePath = getSessionPath();
    const data = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: session.user,
    };
    const encrypted = encryptData(JSON.stringify(data));
    fs.writeFileSync(filePath, encrypted, { mode: 0o600 });

    // Remove old plaintext session if exists
    const oldPath = path.join(app.getPath('userData'), 'session.json');
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

    console.log('[Sesion] Sesion guardada (encriptada).');
  } catch (err) {
    console.error('[Sesion] Error al guardar sesion:', err.message);
  }
}

/**
 * Carga la sesion almacenada en disco.
 */
function loadSession() {
  try {
    const filePath = getSessionPath();

    // Try encrypted file first
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath);
      const session = JSON.parse(decryptData(raw));
      console.log('[Sesion] Sesion cargada (encriptada).');
      return session;
    }

    // Fallback: migrate old plaintext session
    const oldPath = path.join(app.getPath('userData'), 'session.json');
    if (fs.existsSync(oldPath)) {
      const raw = fs.readFileSync(oldPath, 'utf-8');
      const session = JSON.parse(raw);
      // Re-save encrypted
      saveSession(session);
      console.log('[Sesion] Sesion migrada de texto plano a encriptada.');
      return session;
    }

    console.log('[Sesion] No se encontro archivo de sesion.');
    return null;
  } catch (err) {
    console.error('[Sesion] Error al leer sesion:', err.message);
    return null;
  }
}

/**
 * Elimina el archivo de sesion del disco.
 */
function clearSession() {
  try {
    const filePath = getSessionPath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('[Sesion] Sesion eliminada del disco.');
    }
    // Also remove old plaintext if exists
    const oldPath = path.join(app.getPath('userData'), 'session.json');
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  } catch (err) {
    console.error('[Sesion] Error al eliminar sesion:', err.message);
  }
}

module.exports = {
  saveSession,
  loadSession,
  clearSession,
};
