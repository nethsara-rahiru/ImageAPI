import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { setup, register, connect, session, png } from './helpers.js';
import { posterSchema } from '../../server/posters/schema.js';
import { composePoster, preflightPoster } from '../../server/posters/composer.js';
import { publicAddress, resolveWebhook, postWebhook } from '../../server/jobs/webhooks.js';
import { createHmac } from 'node:crypto';
const input = {
  provider: 'openai',
  prompt: 'A tropical summer music event',
  headline: 'SUMMER NIGHTS',
  subtitle: 'Live music by the ocean',
  details: ['August 15 · 6 PM', 'Ocean Park'],
  cta: 'RESERVE YOUR PLACE',
};
async function waitJob(env, id) {
  for (let i = 0; i < 150; i++) {
    const result = await env.agent.get('/v1/posters/' + id);
    if (!['queued', 'running'].includes(result.body.status)) return result;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error('Poster job did not finish');
}
test('all five layouts produce exact-size verified posters with readable text', async () => {
  for (const layout of ['editorial', 'bold', 'minimal', 'event', 'sale']) {
    const body = posterSchema.parse({
      ...input,
      layout,
      size: layout === 'sale' ? 'landscape' : 'portrait',
    });
    const result = await composePoster(
      { encoded: png.toString('base64'), width: 120, height: 60 },
      body,
      null,
    );
    const metadata = await sharp(result.buffer).metadata();
    assert.equal(metadata.width, layout === 'sale' ? 1920 : 1080);
    assert.equal(metadata.height, layout === 'sale' ? 1080 : 1350);
    assert.equal(result.design.quality.passed, true);
    assert.ok(result.design.quality.checks.text_contrast >= 4.5);
    assert.equal(result.design.text.find((b) => b.field === 'headline').text, input.headline);
  }
});
test('unreadable copy and unsupported characters fail before a provider call', () => {
  assert.throws(
    () => preflightPoster(posterSchema.parse({ ...input, headline: '🌴🌴' })),
    (e) => e.status === 422,
  );
  assert.throws(
    () =>
      preflightPoster(
        posterSchema.parse({
          ...input,
          size: 'landscape',
          headline: 'W'.repeat(160),
          details: Array(5).fill('W'.repeat(120)),
          subtitle: 'W'.repeat(260),
        }),
      ),
    (e) => e.status === 422,
  );
  assert.doesNotThrow(() =>
    preflightPoster(posterSchema.parse({ ...input, headline: 'සුබ දවසක්', subtitle: 'வணக்கம்' })),
  );
});
test('brands are encrypted, owned, and validate logos', async (t) => {
  const env = setup(t),
    account = await register(env);
  const save = await session(env.agent, account, 'post', '/v1/brands').send({
    name: 'Ocean Studio',
    logo: png.toString('base64'),
  });
  assert.equal(save.status, 201);
  assert.ok(save.body.logo);
  assert.ok(
    !env.context.db
      .prepare('SELECT encrypted_profile FROM brands')
      .get()
      .encrypted_profile.includes('Ocean Studio'),
  );
  assert.equal(
    (
      await session(env.agent, account, 'post', '/v1/brands').send({
        name: 'Unsafe',
        logo: '<svg/>',
      })
    ).status,
    422,
  );
  const second = await register(env);
  assert.equal((await env.agent.get('/v1/brands')).body.brands.length, 0);
  assert.equal(
    (await session(env.agent, second, 'delete', '/v1/brands/' + save.body.id)).status,
    404,
  );
});
test('poster jobs generate, deduplicate, export, isolate, and revoke download links on deletion', async (t) => {
  const env = setup(t, { config: { jobInterval: 30 } }),
    account = await register(env);
  await connect(env, account);
  const create = () =>
    session(env.agent, account, 'post', '/v1/posters')
      .set('Idempotency-Key', 'test-poster-request-001')
      .send(input);
  const first = await create();
  assert.equal(first.status, 202);
  const repeat = await create();
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.id, first.body.id);
  assert.equal(
    (
      await session(env.agent, account, 'post', '/v1/posters')
        .set('Idempotency-Key', 'test-poster-request-001')
        .send({ ...input, headline: 'Changed' })
    ).status,
    409,
  );
  const result = await waitJob(env, first.body.id);
  assert.equal(result.body.status, 'completed', JSON.stringify(result.body.error));
  assert.equal(env.calls.length, 1);
  assert.ok(!env.calls[0].body.prompt.includes(input.headline));
  for (const format of ['png', 'jpeg', 'webp']) {
    const output = await env.agent.get(`/v1/posters/${first.body.id}/output/${format}`);
    assert.equal(output.status, 200);
    assert.equal((await sharp(output.body).metadata()).format, format);
  }
  const capability = new URL(result.body.result.downloads.png.url);
  assert.equal((await env.request.get(capability.pathname + capability.search)).status, 200);
  const wrong = capability.pathname.replace('/png', '/jpeg') + capability.search;
  assert.equal((await env.request.get(wrong)).status, 401);
  const second = await register(env);
  assert.equal((await env.agent.get('/v1/posters/' + first.body.id)).status, 404);
  assert.equal((await env.request.get(capability.pathname + capability.search)).status, 200);
  const bearer = await env.request
    .get('/v1/posters/' + first.body.id)
    .set('Authorization', 'Bearer ' + account.api_key);
  assert.equal(bearer.status, 200);
  assert.equal(
    (
      await env.request
        .delete('/v1/posters/' + first.body.id)
        .set('Authorization', 'Bearer ' + account.api_key)
    ).status,
    204,
  );
  assert.equal((await env.request.get(capability.pathname + capability.search)).status, 410);
  assert.equal((await env.agent.get('/v1/posters')).body.jobs.length, 0);
});
test('webhook destinations reject private networks and signatures cover the exact payload', async () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '::1',
    '::ffff:127.0.0.1',
    '192.168.1.2',
  ])
    assert.equal(publicAddress(address), false);
  await assert.rejects(
    resolveWebhook('https://example.com/callback', async () => [
      { address: '127.0.0.1', family: 4 },
    ]),
    (e) => e.status === 422,
  );
  await assert.rejects(resolveWebhook('http://example.com/callback'), (e) => e.status === 422);
  let called = false;
  const sent = await postWebhook(
    'https://example.com/callback',
    'test-webhook-secret-long-enough',
    { event_id: 'poster.test.completed' },
    {
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      now: () => 123,
      send: async (url, options) => {
        called = true;
        assert.equal(options.redirect, 'manual');
        assert.equal(
          options.headers['X-ImageAPI-Signature'],
          't=123,v1=' +
            createHmac('sha256', 'test-webhook-secret-long-enough')
              .update('123.' + options.body)
              .digest('hex'),
        );
        return new Response(null, { status: 204 });
      },
    },
  );
  assert.equal(called, true);
  assert.equal(sent, true);
});

test('retention removes files and input while retaining an idempotency tombstone', async (t) => {
  let clock = 1792700000;
  const env = setup(t, { now: () => clock, config: { jobInterval: 30 } }),
    account = await register(env);
  await connect(env, account);
  const created = await session(env.agent, account, 'post', '/v1/posters')
    .set('Idempotency-Key', 'expires-in-one-hour')
    .send({ ...input, retention_hours: 1 });
  const completed = await waitJob(env, created.body.id);
  assert.equal(completed.body.status, 'completed');
  clock += 3601;
  await env.context.posterWorker.kick();
  const expired = await env.agent.get('/v1/posters/' + created.body.id);
  assert.equal(expired.body.status, 'expired');
  assert.equal(expired.body.input, undefined);
  assert.equal(
    env.context.db
      .prepare('SELECT encrypted_input FROM poster_jobs WHERE id=?')
      .get(created.body.id).encrypted_input,
    null,
  );
  assert.equal((await env.agent.get(`/v1/posters/${created.body.id}/output/png`)).status, 410);
  const replay = await session(env.agent, account, 'post', '/v1/posters')
    .set('Idempotency-Key', 'expires-in-one-hour')
    .send({ ...input, retention_hours: 1 });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.status, 'expired');
  assert.equal(env.calls.length, 1);
});

test('queued work survives a restart and interrupted work is not billed twice', async (t) => {
  const { createApp } = await import('../../server/app.js');
  const { default: request } = await import('supertest');
  const { reserve } = await import('../../server/services/usage.js');
  const env = setup(t),
    account = await register(env);
  await connect(env, account);
  await env.context.posterWorker.close();
  const queued = await session(env.agent, account, 'post', '/v1/posters').send(input);
  const interrupted = await session(env.agent, account, 'post', '/v1/posters').send({
    ...input,
    headline: 'Interrupted poster',
  });
  const user = env.context.db.prepare('SELECT id FROM users').get();
  const usageId = reserve(
    env.context,
    { userId: user.id, keyId: null },
    { provider: 'openai', model: 'gpt-image-1', size: '1024x1024' },
  );
  env.context.db
    .prepare("UPDATE poster_jobs SET status='running',usage_id=? WHERE id=?")
    .run(usageId, interrupted.body.id);
  await env.close();
  let calls = 0;
  const runtime = createApp({
    config: { dataDir: env.dataDir, publicOrigin: 'http://testserver', jobInterval: 30 },
    generateImage: async () => {
      calls++;
      return { encoded: png.toString('base64'), width: 120, height: 60 };
    },
  });
  try {
    const client = request(runtime.app),
      auth = 'Bearer ' + account.api_key;
    const old = await client.get('/v1/posters/' + interrupted.body.id).set('Authorization', auth);
    assert.equal(old.body.status, 'unknown');
    assert.equal(
      runtime.context.db.prepare('SELECT status FROM usage WHERE id=?').get(usageId).status,
      'unknown',
    );
    for (let i = 0; i < 150; i++) {
      const job = await client.get('/v1/posters/' + queued.body.id).set('Authorization', auth);
      if (job.body.status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.equal(
      (await client.get('/v1/posters/' + queued.body.id).set('Authorization', auth)).body.status,
      'completed',
    );
    assert.equal(calls, 1);
  } finally {
    await runtime.close();
  }
});

test('provider failure is sanitized, frees monthly quota, and never automatically retries', async (t) => {
  const { HttpError } = await import('../../server/lib/errors.js');
  let calls = 0;
  const env = setup(t, {
      config: { jobInterval: 30 },
      generateImage: async () => {
        calls++;
        throw new HttpError(424, 'Provider denied model access');
      },
    }),
    account = await register(env);
  await connect(env, account);
  const created = await session(env.agent, account, 'post', '/v1/posters').send(input);
  const result = await waitJob(env, created.body.id);
  assert.equal(result.body.status, 'failed');
  assert.equal(result.body.error.detail, 'Provider denied model access');
  await env.context.posterWorker.kick();
  assert.equal(calls, 1);
  assert.equal(env.context.db.prepare('SELECT status FROM usage').get().status, 'failed');
});

test('preflight rejects incomplete provider/brand and unsafe webhook requests without generating', async (t) => {
  const env = setup(t),
    account = await register(env);
  assert.equal((await session(env.agent, account, 'post', '/v1/posters').send(input)).status, 409);
  await connect(env, account);
  assert.equal(
    (
      await session(env.agent, account, 'post', '/v1/posters').send({
        ...input,
        brand_id: 'brand_' + 'f'.repeat(24),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await session(env.agent, account, 'post', '/v1/posters').send({
        ...input,
        webhook: {
          url: 'https://127.0.0.1/callback',
          secret: 'a-long-secret-at-least-24-characters',
        },
      })
    ).status,
    422,
  );
  assert.equal(env.calls.length, 0);
});

test('webhook retries are signed-delivery retries only and never regenerate artwork', async (t) => {
  let clock = 1792700000,
    delivered = 0;
  const env = setup(t, {
    now: () => clock,
    config: { jobInterval: 30 },
    deliverWebhook: async (url, secret, payload) => {
      delivered++;
      assert.equal(secret, 'webhook-secret-at-least-24-characters');
      assert.equal(payload.type, 'poster.completed');
      assert.ok(payload.job.result.downloads.png.url);
      return delivered > 1;
    },
  });
  const account = await register(env);
  await connect(env, account);
  const submitted = await session(env.agent, account, 'post', '/v1/posters').send({
    ...input,
    webhook: {
      url: 'https://93.184.216.34/callback',
      secret: 'webhook-secret-at-least-24-characters',
    },
  });
  assert.equal(submitted.status, 202);
  await waitJob(env, submitted.body.id);
  for (let i = 0; i < 30 && delivered === 0; i++) {
    await env.context.posterWorker.kick();
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(delivered, 1);
  clock += 31;
  for (let i = 0; i < 30 && delivered < 2; i++) {
    await env.context.posterWorker.kick();
    await new Promise((r) => setTimeout(r, 20));
  }
  const result = await env.agent.get('/v1/posters/' + submitted.body.id);
  assert.equal(result.body.webhook.status, 'delivered');
  assert.equal(result.body.webhook.attempts, 2);
  assert.equal(env.calls.length, 1);
  assert.ok(!result.text.includes('webhook-secret-at-least-24-characters'));
});
