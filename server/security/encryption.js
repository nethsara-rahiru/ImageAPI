import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, linkSync, unlinkSync } from 'node:fs';
import path from 'node:path';

export function loadEncryption(config) {
  const filename = path.join(config.dataDir, 'encryption.key');
  let encoded = config.encryptionKey;
  if (!encoded) {
    if (!existsSync(filename)) {
      const temporary = filename + '.' + randomBytes(8).toString('hex') + '.tmp';
      writeFileSync(temporary, randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });
      try {
        linkSync(temporary, filename);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      } finally {
        unlinkSync(temporary);
      }
    }
    encoded = readFileSync(filename, 'utf8').trim();
  }
  if (!/^[A-Za-z0-9_-]{43}=?$/.test(encoded))
    throw new Error('Encryption key must be a base64url-encoded 32-byte key');
  const key = Buffer.from(encoded, 'base64url');
  const aad = Buffer.from('imageapi:provider-key:v2');
  return {
    encrypt(plaintext) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(aad);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return 'v2:' + Buffer.concat([nonce, encrypted, cipher.getAuthTag()]).toString('base64url');
    },
    decrypt(value) {
      if (value.startsWith('v2:')) {
        const raw = Buffer.from(value.slice(3), 'base64url');
        if (raw.length < 29) throw new Error('Invalid encrypted key');
        const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
        decipher.setAAD(aad);
        decipher.setAuthTag(raw.subarray(-16));
        return Buffer.concat([decipher.update(raw.subarray(12, -16)), decipher.final()]).toString(
          'utf8',
        );
      }
      // Read-only compatibility with Fernet from the former Python backend.
      const raw = Buffer.from(value, 'base64url');
      if (raw.length < 73 || raw[0] !== 0x80) throw new Error('Invalid legacy key');
      const expected = createHmac('sha256', key.subarray(0, 16))
        .update(raw.subarray(0, -32))
        .digest();
      if (!timingSafeEqual(expected, raw.subarray(-32)))
        throw new Error('Invalid legacy signature');
      const decipher = createDecipheriv('aes-128-cbc', key.subarray(16), raw.subarray(9, 25));
      return Buffer.concat([decipher.update(raw.subarray(25, -32)), decipher.final()]).toString(
        'utf8',
      );
    },
  };
}
