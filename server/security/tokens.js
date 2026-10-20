import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
export const token = () => randomBytes(32).toString('base64url');
export const id = () => randomBytes(12).toString('hex');
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function equal(a, b) {
  const left = Buffer.from(a ?? '');
  const right = Buffer.from(b ?? '');
  return left.length === right.length && timingSafeEqual(left, right);
}
