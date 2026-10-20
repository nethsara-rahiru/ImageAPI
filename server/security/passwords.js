import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const digest = await derive(password, salt, 64, parameters);
  return `scrypt$32768$8$3$${salt.toString('base64url')}$${digest.toString('base64url')}`;
}
export async function verifyPassword(password, stored) {
  let salt, expected, options;
  if (stored?.startsWith('scrypt$')) {
    const [algorithm, n, r, p, encodedSalt, encodedHash] = stored.split('$');
    if (algorithm !== 'scrypt' || n !== '32768' || r !== '8' || p !== '3') return false;
    salt = Buffer.from(encodedSalt || '', 'base64url');
    expected = Buffer.from(encodedHash || '', 'base64url');
    options = parameters;
  } else {
    // Python hashlib.scrypt used a 16-byte salt and a 64-byte derived key.
    const legacy = Buffer.from(stored || '', 'base64');
    salt = legacy.subarray(0, 16);
    expected = legacy.subarray(16);
    options = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
  }
  if (salt.length !== 16 || expected.length !== 64) {
    await derive(password, Buffer.alloc(16), 64, parameters);
    return false;
  }
  const actual = await derive(password, salt, 64, options);
  return timingSafeEqual(expected, actual);
}
