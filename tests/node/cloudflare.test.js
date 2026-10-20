import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, register, session, png } from './helpers.js';
import { createTransport } from '../../server/providers/transport.js';
import { createGenerator } from '../../server/providers/index.js';
import { loadConfig } from '../../server/config/index.js';
import { generationSchema } from '../../server/services/generation-schema.js';
import { parse } from '../../server/lib/validation.js';
const accountId = 'a'.repeat(32);
const token = 'cloudflare-test-token-only';
const model = '@cf/black-forest-labs/flux-1-schnell';
const body = { provider: 'cloudflare', prompt: 'A pastel greenhouse' };
const save = (env, account, values = {}) =>
  session(env.agent, account, 'put', '/api/providers/cloudflare').send({
    api_key: token,
    account_id: accountId,
    ...values,
  });

test('Cloudflare credentials require an Account ID and are encrypted and account-isolated', async (t) => {
  const env = setup(t),
    account = await register(env);
  for (const value of [undefined, '', 'short', '../other-account', 'g'.repeat(32)]) {
    const result = await save(env, account, { account_id: value });
    assert.equal(result.status, 422);
    assert.ok(!result.text.includes(token));
  }
  assert.equal((await save(env, account)).status, 200);
  const row = env.context.db
    .prepare("SELECT encrypted_key FROM provider_keys WHERE provider='cloudflare'")
    .get();
  assert.ok(!row.encrypted_key.includes(token));
  assert.ok(!row.encrypted_key.includes(accountId));
  assert.deepEqual(JSON.parse(env.context.encryption.decrypt(row.encrypted_key)), {
    api_key: token,
    account_id: accountId,
  });
  const listing = await env.agent.get('/api/providers');
  assert.ok(!listing.text.includes(token));
  assert.ok(!listing.text.includes(accountId));
  assert.equal(listing.body.providers.find((p) => p.id === 'cloudflare').connected, true);
  const other = await register(env);
  assert.equal(
    (await env.agent.get('/api/providers')).body.providers.find((p) => p.id === 'cloudflare')
      .connected,
    false,
  );
  assert.equal(
    (await session(env.agent, other, 'post', '/v1/images/generations').send(body)).status,
    409,
  );
  assert.equal(
    (await session(env.agent, other, 'delete', '/api/providers/cloudflare')).status,
    204,
  );
  assert.equal(
    env.context.db
      .prepare("SELECT COUNT(*) AS n FROM provider_keys WHERE provider='cloudflare'")
      .get().n,
    1,
  );
});

test('Cloudflare playground and bearer API use saved credentials and log real provider metadata', async (t) => {
  let calls = 0;
  const env = setup(t, {
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(
        url,
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      );
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      assert.deepEqual(JSON.parse(options.body), { prompt: body.prompt, steps: 4 });
      return Response.json({
        success: true,
        result: { image: png.toString('base64') },
        errors: [],
        messages: [],
      });
    },
  });
  const account = await register(env);
  await save(env, account);
  const first = await session(env.agent, account, 'post', '/v1/images/generations').send(body);
  assert.equal(first.status, 200);
  assert.equal(first.body.provider, 'cloudflare');
  assert.equal(first.body.model, model);
  assert.equal(first.body.data[0].mime_type, 'image/png');
  assert.equal(first.body.data[0].width, 120);
  const second = await env.request
    .post('/v1/images/generations')
    .set('Authorization', `Bearer ${account.api_key}`)
    .send(body);
  assert.equal(second.status, 200);
  assert.equal(calls, 2);
  const rows = env.context.db
    .prepare('SELECT provider,model,status,source FROM usage ORDER BY source')
    .all();
  assert.equal(rows.length, 2);
  assert.ok(
    rows.every((r) => r.provider === 'cloudflare' && r.model === model && r.status === 'success'),
  );
  assert.deepEqual(
    rows.map((r) => r.source),
    ['api', 'playground'],
  );
  await session(env.agent, account, 'delete', '/api/providers/cloudflare');
  assert.equal(
    (await session(env.agent, account, 'post', '/v1/images/generations').send(body)).status,
    409,
  );
  assert.equal(calls, 2);
});

test('Cloudflare model capabilities are validated before any provider request', () => {
  assert.equal(parse(generationSchema, body).model, model);
  for (const extra of [
    { prompt: 'x'.repeat(2049) },
    { size: '1536x1024' },
    { quality: 'high' },
    { model: '../other-model' },
  ])
    assert.throws(
      () => parse(generationSchema, { ...body, ...extra }),
      (e) => e.status === 422,
    );
});

test('Cloudflare authentication, access, and quota errors are named and sanitized', async (t) => {
  for (const [status, expected] of [
    [401, 424],
    [403, 424],
    [429, 429],
  ]) {
    await t.test(String(status), async () => {
      const env = setup(t, {
        fetchImpl: async () =>
          Response.json({ success: false, errors: [{ message: token }] }, { status }),
      });
      const account = await register(env);
      await save(env, account);
      const result = await session(env.agent, account, 'post', '/v1/images/generations').send(body);
      assert.equal(result.status, expected);
      assert.match(result.body.detail, /Cloudflare/);
      assert.ok(!result.text.includes(token));
      assert.equal(env.context.db.prepare('SELECT status FROM usage').get().status, 'failed');
    });
  }
});

test('Cloudflare invalid saved credentials and invalid output fail safely', async () => {
  const config = loadConfig();
  for (const response of [
    { success: false },
    { success: true, result: {} },
    { success: true, result: { image: 'not-image-data' } },
  ]) {
    const generate = createGenerator(
      createTransport(config, async () => Response.json(response)),
      config,
    );
    await assert.rejects(
      generate(
        JSON.stringify({ api_key: token, account_id: accountId }),
        parse(generationSchema, body),
      ),
      (e) => e.status === 502,
    );
  }
  let called = false;
  const generate = createGenerator(
    createTransport(config, async () => {
      called = true;
    }),
    config,
  );
  for (const credential of [
    'plain-key',
    'null',
    JSON.stringify({ api_key: token, account_id: '../escape' }),
  ])
    await assert.rejects(
      generate(credential, parse(generationSchema, body)),
      (e) => e.status === 409,
    );
  assert.equal(called, false);
});
