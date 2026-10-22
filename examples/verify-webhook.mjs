import { createHmac, timingSafeEqual } from 'node:crypto';
// Pass the RAW request body before JSON parsing. Store event_id with a unique constraint
// in your application so repeated deliveries do not repeat fulfilment actions.
export function verifyWebhook(rawBody, signature, secret, now = Math.floor(Date.now() / 1000)) {
  const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(signature || '');
  if (!match || Math.abs(now - Number(match[1])) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${match[1]}.`).update(rawBody).digest();
  const received = Buffer.from(match[2], 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
