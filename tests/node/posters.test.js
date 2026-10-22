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
