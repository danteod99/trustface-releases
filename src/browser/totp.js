// TOTP (Time-based One-Time Password) generator
// Generates 6-digit 2FA codes from a base32-encoded secret
const crypto = require('crypto');

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(encoded) {
  // Remove spaces and convert to uppercase
  encoded = encoded.replace(/[\s-]/g, '').toUpperCase();

  const output = [];
  let buffer = 0;
  let bitsLeft = 0;

  for (const char of encoded) {
    const val = BASE32_CHARS.indexOf(char);
    if (val === -1) continue; // Skip invalid chars

    buffer = (buffer << 5) | val;
    bitsLeft += 5;

    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      output.push((buffer >> bitsLeft) & 0xff);
    }
  }

  return Buffer.from(output);
}

function generateTOTP(secret, timeStep = 30, digits = 6) {
  // Decode the base32 secret
  const key = base32Decode(secret);

  // Get current time step
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStep);

  // Convert counter to 8-byte buffer (big-endian)
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter & 0xffffffff, 4);

  // HMAC-SHA1
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  // Generate digits
  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

module.exports = { generateTOTP };
