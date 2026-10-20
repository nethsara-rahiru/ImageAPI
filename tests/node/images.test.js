import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { setup, register, session, connect, png } from './helpers.js';
import { HttpError } from '../../server/lib/errors.js';
import { reserve } from '../../server/services/usage.js';
import { parse } from '../../server/lib/validation.js';
import { generationSchema } from '../../server/services/generation-schema.js';

test('image endpoints require authentication', async (t) => {
  const env = setup(t);
  assert.equal(
    (await env.request.post('/v1/images/generations').send({ prompt: 'cat' })).status,
    401,
  );
  assert.equal(
    (await env.request.post('/v1/images/transform').attach('file', png, 'x.png')).status,
    401,
  );
});
test('a saved account provider key is mandatory with no global fallback', async (t) => {
  const env = setup(t),
    account = await register(env);
  assert.equal(
    (await session(env.agent, account, 'post', '/v1/images/generations').send({ prompt: 'cat' }))
      .status,
    409,
  );
  assert.equal((await env.agent.get('/api/usage')).body.summary.requests, 0);
  assert.equal(env.calls.length, 0);
});
test('playground and bearer generation share a real metadata ledger', async (t) => {
  const env = setup(t),
    account = await register(env);
  await connect(env, account);
  const response = await session(env.agent, account, 'post', '/v1/images/generations').send({
    prompt: ' A cat ',
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.data[0].width, 120);
  assert.equal(response.body.data[0].mime_type, 'image/png');
  assert.equal(response.headers['x-request-id'], response.body.id);
  assert.equal(
    (
      await env.request
        .post('/v1/images/generations')
        .set('Authorization', 'Bearer ' + account.api_key)
        .send({ prompt: 'Landscape' })
    ).status,
    200,
  );
  assert.equal(env.calls[0].key, 'sk-user-fixture-only');
  assert.equal(env.calls[0].body.prompt, 'A cat');
  const usage = (await env.agent.get('/api/usage')).body;
  assert.equal(usage.summary.images, 2);
  assert.equal(usage.summary.requests, 2);
  assert.deepEqual(new Set(usage.requests.map((r) => r.source)), new Set(['api', 'playground']));
  assert.equal(
    usage.daily.reduce((a, b) => a + b.count, 0),
    2,
  );
  assert.ok(usage.requests.every((row) => !('prompt' in row)));
  assert.equal(usage.providers[0].count, 2);
  assert.ok((await env.agent.get('/api/keys')).body.keys[0].last_used_at);
});
for (const [label, body] of Object.entries({
  empty: { prompt: '' },
  blank: { prompt: '  ' },
  size: { prompt: 'cat', size: '42x42' },
  provider: { prompt: 'cat', provider: 'bad' },
  model: { prompt: 'cat', model: 'not-supported' },
  quality: { prompt: 'cat', provider: 'gemini', quality: 'high' },
  unknownField: { prompt: 'cat', n: 10 },
  type: { prompt: 12 },
}))
  test(`generation validation: ${label}`, async (t) => {
    const env = setup(t),
      account = await register(env);
    assert.equal(
      (await session(env.agent, account, 'post', '/v1/images/generations').send(body)).status,
      422,
    );
  });
test('failures return sanitized errors and a request ID, without consuming quota', async (t) => {
  const env = setup(t, {
      generateImage: async () => {
        throw new HttpError(424, 'Provider key rejected');
      },
    }),
    account = await register(env);
  await connect(env, account);
  const response = await session(env.agent, account, 'post', '/v1/images/generations').send({
    prompt: 'cat',
  });
  assert.equal(response.status, 424);
  assert.match(response.headers['x-request-id'], /^req_/);
  const usage = (await env.agent.get('/api/usage')).body;
  assert.equal(usage.summary.used, 0);
  assert.equal(usage.summary.failed, 1);
  assert.equal(usage.requests[0].error_code, '424');
});
test('unexpected errors do not leak provider credentials', async (t) => {
  const env = setup(t, {
      generateImage: async () => {
        throw new Error('sk-private-provider-data');
      },
    }),
    account = await register(env);
  await connect(env, account);
  const response = await session(env.agent, account, 'post', '/v1/images/generations').send({
    prompt: 'cat',
  });
  assert.equal(response.status, 500);
  assert.ok(!response.text.includes('sk-private-provider-data'));
  assert.equal((await env.agent.get('/api/usage')).body.summary.failed, 1);
});
test('monthly quota is enforced before calling the provider', async (t) => {
  const env = setup(t, { config: { freeLimit: 2 } }),
    account = await register(env);
  await connect(env, account);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await session(env.agent, account, 'post', '/v1/images/generations').send({ prompt: 'cat' }))
        .status,
      200,
    );
  assert.equal(
    (await session(env.agent, account, 'post', '/v1/images/generations').send({ prompt: 'cat' }))
      .status,
    429,
  );
  assert.equal(env.calls.length, 2);
});
test('concurrent requests cannot overspend one remaining image', async (t) => {
  let calls = 0;
  const env = setup(t, {
      config: { freeLimit: 1 },
      generateImage: async () => {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 150));
        return { encoded: png.toString('base64'), width: 120, height: 60 };
      },
    }),
    account = await register(env);
  await connect(env, account);
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      env.request
        .post('/v1/images/generations')
        .set('Authorization', 'Bearer ' + account.api_key)
        .send({ prompt: 'cat' }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 429, 429]);
  assert.equal(calls, 1);
  assert.equal((await env.agent.get('/api/usage')).body.summary.used, 1);
});
test('two concurrent requests are allowed and the third is rejected', async (t) => {
  const env = setup(t, {
      generateImage: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { encoded: png.toString('base64'), width: 120, height: 60 };
      },
    }),
    account = await register(env);
  await connect(env, account);
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      env.request
        .post('/v1/images/generations')
        .set('Authorization', 'Bearer ' + account.api_key)
        .send({ prompt: 'cat' }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 429]);
});
test('pending requests become unknown after interruption and retain their reservation', async (t) => {
  const env = setup(t),
    account = await register(env);
  await connect(env, account);
  const id = reserve(
    env.context,
    { userId: account.user.id, keyId: null },
    parse(generationSchema, { prompt: 'cat' }),
  );
  env.context.db
    .prepare('UPDATE usage SET created_at=? WHERE id=?')
    .run(env.context.now() - 400, id);
  const result = (await env.agent.get('/api/usage')).body;
  assert.equal(result.requests[0].status, 'unknown');
  assert.equal(result.summary.used, 1);
});
test('monthly allowance resets on the first day in UTC', async (t) => {
  let now = Date.UTC(2026, 9, 31, 23, 59, 59) / 1000;
  const env = setup(t, { now: () => now, config: { freeLimit: 1 } }),
    account = await register(env);
  await connect(env, account);
  assert.equal(
    (await session(env.agent, account, 'post', '/v1/images/generations').send({ prompt: 'cat' }))
      .status,
    200,
  );
  now += 2;
  assert.equal(
    (await session(env.agent, account, 'post', '/v1/images/generations').send({ prompt: 'cat' }))
      .status,
    200,
  );
  assert.equal((await env.agent.get('/api/usage')).body.summary.used, 1);
});
test('20 generation attempts per minute are allowed', async (t) => {
  const env = setup(t),
    account = await register(env);
  await connect(env, account);
  for (let i = 0; i < 20; i++)
    assert.equal(
      (await session(env.agent, account, 'post', '/v1/images/generations').send({ prompt: 'cat' }))
        .status,
      200,
    );
  const response = await session(env.agent, account, 'post', '/v1/images/generations').send({
    prompt: 'cat',
  });
  assert.equal(response.status, 429);
  assert.ok(response.headers['retry-after']);
});
test('history supports pagination and status filters with validation', async (t) => {
  const env = setup(t),
    account = await register(env);
  await connect(env, account);
  for (let i = 0; i < 11; i++)
    await session(env.agent, account, 'post', '/v1/images/generations').send({ prompt: 'cat' });
  const page1 = (await env.agent.get('/api/usage')).body,
    page2 = (await env.agent.get('/api/usage?page=2')).body;
  assert.equal(page1.requests.length, 10);
  assert.equal(page2.requests.length, 1);
  assert.equal(page2.pagination.total, 11);
  assert.equal((await env.agent.get('/api/usage?status=failed')).body.requests.length, 0);
  for (const query of ['page=0', 'page=1.5', 'status=bad', 'page[]=1'])
    assert.equal((await env.agent.get('/api/usage?' + query)).status, 422);
});
for (const format of ['png', 'jpeg', 'webp'])
  test(`resize and convert to ${format}`, async (t) => {
    const env = setup(t),
      account = await register(env);
    const response = await session(
      env.agent,
      account,
      'post',
      `/v1/images/transform?width=30&format=${format}`,
    ).attach('file', png, 'input.png');
    assert.equal(response.status, 200, response.text);
    const info = await sharp(response.body).metadata();
    assert.equal(info.width, 30);
    assert.equal(info.height, 15);
    assert.equal(info.format, format);
    assert.equal(response.headers['cache-control'], 'no-store');
    if (format === 'jpeg') {
      const data = await sharp(response.body).raw().toBuffer();
      assert.deepEqual([...data.subarray(0, 3)], [255, 255, 255]);
    }
  });
test('resize fits a bounding box and never upscales', async (t) => {
  const env = setup(t),
    account = await register(env);
  for (const [query, size] of [
    ['width=50&height=10', [20, 10]],
    ['width=400', [120, 60]],
  ]) {
    const result = await session(
      env.agent,
      account,
      'post',
      '/v1/images/transform?' + query,
    ).attach('file', png, 'x.png');
    assert.equal(result.status, 200);
    const metadata = await sharp(result.body).metadata();
    assert.deepEqual([metadata.width, metadata.height], size);
  }
});
test('invalid upload options and files are rejected', async (t) => {
  const env = setup(t),
    account = await register(env);
  for (const query of ['width=0', 'height=4097', 'format=gif', 'quality=101'])
    assert.equal(
      (
        await session(env.agent, account, 'post', '/v1/images/transform?' + query).attach(
          'file',
          png,
          'x.png',
        )
      ).status,
      422,
    );
  assert.equal(
    (
      await session(env.agent, account, 'post', '/v1/images/transform').attach(
        'file',
        Buffer.from('not-image'),
        'x.png',
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await session(env.agent, account, 'post', '/v1/images/transform').attach(
        'file',
        Buffer.alloc(0),
        'x.png',
      )
    ).status,
    400,
  );
  assert.equal(
    (await session(env.agent, account, 'post', '/v1/images/transform').send({})).status,
    422,
  );
});
test('transform enforces upload and decoded pixel limits', async (t) => {
  const env = setup(t, { config: { maxPixels: 100 } }),
    account = await register(env);
  assert.equal(
    (await session(env.agent, account, 'post', '/v1/images/transform').attach('file', png, 'x.png'))
      .status,
    413,
  );
  const large = Buffer.alloc(10 * 1024 * 1024 + 1);
  assert.equal(
    (
      await session(env.agent, account, 'post', '/v1/images/transform').attach(
        'file',
        large,
        'x.png',
      )
    ).status,
    413,
  );
});
test('legacy generation alias retains the authenticated JSON response', async (t) => {
  const env = setup(t),
    account = await register(env);
  await connect(env, account);
  const response = await session(env.agent, account, 'post', '/v1/images/generate').send({
    prompt: 'cat',
  });
  assert.equal(response.status, 200);
  assert.ok(response.body.data[0].b64_json);
});

test('SVG and GIF uploads are rejected before unsupported decoders run', async (t) => {
  const env = setup(t),
    account = await register(env);
  for (const content of [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),
    Buffer.from('GIF89a'),
  ])
    assert.equal(
      (
        await session(env.agent, account, 'post', '/v1/images/transform').attach(
          'file',
          content,
          'unsupported',
        )
      ).status,
      415,
    );
});

test('OpenAI quota diagnosis survives generation, request IDs, and usage logging', async (t) => {
  const env = setup(t, {
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'credit_balance_exhausted',
            type: 'insufficient_quota',
            message: 'sk-do-not-expose',
          },
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'req_upstream_test' },
        },
      ),
  });
  const account = await register(env);
  await connect(env, account);
  const result = await session(env.agent, account, 'post', '/v1/images/generations').send({
    prompt: 'cat',
  });
  assert.equal(result.status, 429);
  assert.match(result.body.detail, /credit_balance_exhausted/);
  assert.ok(!result.text.includes('sk-do-not-expose'));
  assert.match(result.headers['x-request-id'], /^req_/);
  assert.equal(result.headers['x-provider-request-id'], 'req_upstream_test');
  assert.equal(result.headers['retry-after'], undefined);
  const usage = (await env.agent.get('/api/usage')).body;
  assert.equal(usage.summary.used, 0);
  assert.equal(usage.requests[0].error_code, 'credit_balance_exhausted');
});
