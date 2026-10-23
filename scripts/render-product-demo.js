// Local production API/compositor demo. Artwork is a fixture, never claimed to be a live AI response.
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../server/app.js';
const args = process.argv.slice(2),
  arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const out = path.resolve(arg('--out', 'poster-samples'));
const artwork = arg('--background', null);
const raw = artwork
  ? await readFile(artwork)
  : await sharp(await readFile(new URL('../frontend/assets/speaker-demo.svg', import.meta.url)))
      .png()
      .toBuffer();
const source = await sharp(raw).png().toBuffer();
const temporary = await mkdtemp(path.join(tmpdir(), 'imageapi-product-demo-'));
const runtime = createApp({
  config: { dataDir: temporary, publicOrigin: 'http://127.0.0.1:8080', jobInterval: 25 },
  fetchImpl: async () =>
    Response.json({ success: true, result: { image: source.toString('base64') } }),
});
const server = runtime.app.listen(0, '127.0.0.1');
try {
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function json(route, body, key) {
    const response = await fetch(base + route, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    return data;
  }
  const signup = await fetch(base + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Product demo',
      email: 'local-product-demo@example.com',
      password: 'local-demo-password-unique-123',
    }),
  });
  if (signup.status !== 201) throw new Error('Demo account could not be created');
  const account = await signup.json(),
    cookie = signup.headers.getSetCookie()[0].split(';')[0];
  const provider = await fetch(base + '/api/providers/cloudflare', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': account.csrf, Cookie: cookie },
    body: JSON.stringify({ account_id: 'a'.repeat(32), api_key: 'demo-fixture-cloudflare-key' }),
  });
  if (!provider.ok) throw new Error('Demo provider fixture could not be connected');
  const request = JSON.parse(
    await readFile(new URL('../examples/speaker-promotion.json', import.meta.url), 'utf8'),
  );
  let job = await json('/v1/posters', request, account.api_key);
  const deadline = Date.now() + 15000;
  while (['queued', 'running'].includes(job.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    job = await json('/v1/posters/' + job.id, null, account.api_key);
  }
  if (job.status !== 'completed')
    throw new Error(JSON.stringify(job.error || { status: job.status }));
  const image = await fetch(base + `/v1/posters/${job.id}/output/png`, {
    headers: { Authorization: `Bearer ${account.api_key}` },
  });
  if (!image.ok) throw new Error('Final API output could not be downloaded');
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'speaker-product.png'), Buffer.from(await image.arrayBuffer()));
  const { downloads, ...design } = job.result;
  await writeFile(
    path.join(out, 'speaker-product.json'),
    JSON.stringify(
      {
        source: 'Local asynchronous API demo with fixture artwork; no live provider call',
        artwork: artwork ? 'User-supplied local artwork fixture' : 'Bundled vector illustration',
        request_id: job.request_id,
        design,
      },
      null,
      2,
    ),
  );
  console.log(
    `Local API returned ${design.width} × ${design.height} PNG; copy, offer, features, and readability checks passed. Fixture artwork; no live AI request. Saved ${path.join(out, 'speaker-product.png')}`,
  );
} finally {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeIdleConnections();
  });
  await runtime.close();
  await rm(temporary, { recursive: true, force: true });
}
