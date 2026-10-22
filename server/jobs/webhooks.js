import { lookup } from 'node:dns/promises';
import { createHmac } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { Agent, fetch } from 'undici';
import { HttpError } from '../lib/errors.js';
export function webhookURL(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== '443') ||
    url.hostname.endsWith('.local') ||
    url.hostname === 'localhost'
  )
    throw new HttpError(
      422,
      'Webhooks require a public HTTPS URL on port 443, without credentials or fragments.',
    );
  return url;
}
export function publicAddress(address) {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}
export async function resolveWebhook(value, resolve = lookup) {
  const url = webhookURL(value),
    hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try {
    addresses = ipaddr.isValid(hostname)
      ? [{ address: hostname, family: ipaddr.parse(hostname).kind() === 'ipv4' ? 4 : 6 }]
      : await resolve(hostname, { all: true, verbatim: true });
  } catch {
    throw new HttpError(422, 'Webhook host could not be resolved to public Internet addresses.');
  }
  if (!addresses.length || addresses.some((item) => !publicAddress(item.address)))
    throw new HttpError(
      422,
      'Webhook destination must resolve exclusively to public Internet addresses.',
    );
  return { url, addresses };
}
export async function postWebhook(
  value,
  secret,
  payload,
  { resolve = lookup, send = fetch, now = () => Math.floor(Date.now() / 1000) } = {},
) {
  const { url, addresses } = await resolveWebhook(value, resolve);
  const chosen = addresses.find((a) => a.family === 4) || addresses[0];
  // Pin the checked address for the actual socket. Never follow redirects or send provider credentials.
  const dispatcher = new Agent({
    connect: {
      lookup(hostname, options, callback) {
        callback(null, options.all ? [chosen] : chosen.address, chosen.family);
      },
    },
  });
  const body = JSON.stringify(payload),
    timestamp = String(now());
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  try {
    const result = await send(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ImageAPI-Webhooks/2.0',
        'X-ImageAPI-Signature': `t=${timestamp},v1=${signature}`,
        'X-ImageAPI-Event-ID': payload.event_id,
      },
      body,
      redirect: 'manual',
      dispatcher,
      signal: AbortSignal.timeout(10000),
    });
    await result.body?.cancel();
    return result.status >= 200 && result.status < 300;
  } finally {
    await dispatcher.close();
  }
}
