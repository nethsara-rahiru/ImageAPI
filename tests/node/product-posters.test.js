import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { posterSchema } from '../../server/posters/schema.js';
import { preflightPoster, composePoster } from '../../server/posters/composer.js';
import { planPoster, artworkPrompt } from '../../server/posters/planner.js';
import { setup, register, connect, session, png } from './helpers.js';
const input = {
  provider: 'openai',
  prompt: 'A portable Bluetooth speaker on a dark stone podium with cyan rim lighting',
  headline: 'BIG SOUND.\nANYWHERE.',
  subtitle: 'Portable Bluetooth Speaker',
  eyebrow: 'NOVA AUDIO',
  offer: { label: 'SAVE', value: '25%' },
  features: ['Wireless freedom', 'Deep bass', 'Compact design'],
  cta: 'SHOP THE SOUND',
  accent_color: '#28e7f2',
  layout: 'product',
};

test('product artwork direction is text-free and reserves room for exact overlay copy', () => {
  const body = posterSchema.parse(input),
    plan = planPoster(body);
  assert.equal(plan.layout, 'product');
  assert.equal(plan.geometry.full_bleed, true);
  const prompt = artworkPrompt(body, plan);
  assert.match(prompt, /NO text/);
  assert.match(prompt, /product/i);
  assert.ok(!prompt.includes('BIG SOUND'));
  assert.ok(!prompt.includes('25%'));
  assert.equal(planPoster(posterSchema.parse({ ...input, layout: 'auto' })).layout, 'product');
  assert.equal(
    planPoster(
      posterSchema.parse({
        provider: 'openai',
        prompt: 'Bluetooth speaker campaign',
        headline: 'Sound wherever you go',
      }),
    ).layout,
    'product',
  );
});

test('full-bleed product posters preserve headline, offer, and feature copy at all supported sizes', async () => {
  const source = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  for (const size of ['square', 'portrait', 'story', 'landscape', 'a4']) {
    const body = posterSchema.parse({ ...input, size }),
      result = await composePoster(
        { encoded: source.toString('base64'), width: 1024, height: 1024 },
        body,
        null,
      );
    assert.equal(result.design.full_bleed, true);
    assert.equal(result.design.layout, 'product');
    assert.equal(result.design.quality.passed, true);
    assert.ok(result.design.quality.checks.text_contrast >= 4.5);
    assert.equal(result.design.quality.checks.no_text_overlap, true);
    const text = new Map(result.design.text.map((b) => [b.field, b.text]));
    assert.equal(text.get('headline'), input.headline);
    assert.equal(text.get('offer.value'), '25%');
    input.features.forEach((feature, i) => assert.equal(text.get('features.' + i), feature));
    assert.equal((await sharp(result.buffer).metadata()).width, result.design.width);
  }
});

test('dark brand accents are made readable without changing CTA brand colour', async () => {
  const body = posterSchema.parse({ ...input, accent_color: '#000000' });
  const result = await composePoster(
    { encoded: png.toString('base64'), width: 120, height: 60 },
    body,
    null,
  );
  assert.equal(result.design.accent_color, '#000000');
  assert.notEqual(result.design.headline_accent_color, '#000000');
  assert.ok(result.design.quality.checks.text_contrast >= 4.5);
  assert.ok(result.design.quality.warnings.some((s) => s.includes('lightened')));
});

test('offers are optional and promotional copy never disappears in incompatible layouts', () => {
  assert.equal(posterSchema.safeParse({ ...input, layout: 'editorial' }).success, false);
  assert.equal(posterSchema.safeParse({ ...input, features: ['a', 'b', 'c', 'd'] }).success, false);
  assert.equal(
    posterSchema.safeParse({ ...input, offer: { value: 'a'.repeat(13) } }).success,
    false,
  );
  const body = posterSchema.parse({ ...input, offer: undefined, features: [] });
  assert.doesNotThrow(() => preflightPoster(body));
});

test('saved queued bodies from older versions can render without new optional fields', () => {
  const body = posterSchema.parse({ ...input, offer: undefined });
  delete body.features;
  assert.doesNotThrow(() => preflightPoster(body));
});

test('product jobs return real composed output through the same asynchronous API', async (t) => {
  const env = setup(t, { config: { jobInterval: 30 } }),
    account = await register(env);
  await connect(env, account);
  const response = await session(env.agent, account, 'post', '/v1/posters')
    .set('Idempotency-Key', 'product-campaign-01')
    .send(input);
  assert.equal(response.status, 202);
  let job;
  for (let i = 0; i < 120; i++) {
    job = (await env.agent.get('/v1/posters/' + response.body.id)).body;
    if (!['queued', 'running'].includes(job.status)) break;
    await new Promise((r) => setTimeout(r, 35));
  }
  assert.equal(job.status, 'completed', JSON.stringify(job.error));
  assert.equal(job.result.full_bleed, true);
  const image = await env.request
    .get(`/v1/posters/${job.id}/output/png`)
    .set('Authorization', 'Bearer ' + account.api_key);
  assert.equal(image.status, 200);
  assert.equal((await sharp(image.body).metadata()).height, 1350);
  assert.equal(env.calls.length, 1);
});
