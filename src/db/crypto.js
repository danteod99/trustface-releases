/**
 * Credential encryption for TrustFarm.
 * Uses AES-256-GCM with a machine-specific key derived from hardware ID.
 */
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Get or create a persistent encryption key unique to this machine.
 * Stored in the app's userData directory.
 */
function getEncryptionKey() {
  const keyPath = path.join(app.getPath('userData'), '.trustmind-key');

  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath);
  }

  // Generate a new key seeded from machine-specific data
  const machineId = [
    os.hostname(),
    os.userInfo().username,
    os.cpus()[0]?.model || '',
    os.totalmem().toString(),
  ].join('|');

  const key = crypto.scryptSync(machineId + crypto.randomBytes(16).toString('hex'), 'trustmind-salt', 32);
  fs.writeFileSync(keyPath, key, { mode: 0o600 }); // Read/write only by owner
  return key;
}

let _key = null;
function key() {
  if (!_key) _key = getEncryptionKey();
  return _key;
}

/**
 * Encrypt a string value.
 * Returns base64-encoded string: iv + tag + ciphertext
 */
function encrypt(plaintext) {
  if (!plaintext) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt a base64-encoded string.
 */
function decrypt(ciphertext) {
  if (!ciphertext) return null;
  try {
    const data = Buffer.from(ciphertext, 'base64');
    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key(), iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt };
