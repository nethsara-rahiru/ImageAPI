import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { setup, register, session } from './helpers.js';
import { verifyWebhook } from '../../examples/verify-webhook.mjs';
import { createHmac } from 'node:crypto';

test('documented Node client submits, polls, and saves a finished poster over HTTP', async (t) => {
  const env = setup(t, { config: { jobInterval: 30 } }),
    account = await register(env);
  await session(env.agent, account, 'put', '/api/providers/cloudflare').send({
    api_key: 'cloudflare-client-fixture-only',
    account_id: 'a'.repeat(32),
  });
  const server = env.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL('../../examples/poster.mjs', import.meta.url))],
        {
          cwd: env.dataDir,
          env: {
            ...process.env,
            IMAGEAPI_KEY: account.api_key,
            IMAGEAPI_BASE_URL: `http://127.0.0.1:${server.address().port}`,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let output = '';
      child.stdout.on('data', (data) => (output += data));
      child.stderr.on('data', (data) => (output += data));
      child.once('error', reject);
      child.once('exit', (code) => resolve({ code, output }));
    });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Saved poster.png/);
    const metadata = await sharp(await readFile(env.dataDir + '/poster.png')).metadata();
    assert.equal(metadata.width, 1080);
    assert.equal(metadata.height, 1350);
    assert.equal(env.calls.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('webhook verifier rejects modified bodies, old timestamps, and malformed signatures', () => {
  const raw = Buffer.from('{"event_id":"poster_1.completed"}'),
    secret = 'example-secret-long-enough',
    now = 1234;
  const signature =
    't=1234,v1=' + createHmac('sha256', secret).update('1234.').update(raw).digest('hex');
  assert.equal(verifyWebhook(raw, signature, secret, now), true);
  assert.equal(verifyWebhook(Buffer.from('{}'), signature, secret, now), false);
  assert.equal(verifyWebhook(raw, signature, secret, now + 301), false);
  assert.equal(verifyWebhook(raw, 'bad', secret, now), false);
});
