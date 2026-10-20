import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../../server/providers/transport.js';
import { createGenerator } from '../../server/providers/index.js';
import { loadConfig } from '../../server/config/index.js';
import { parse } from '../../server/lib/validation.js';
import { generationSchema } from '../../server/services/generation-schema.js';
import { normalizeImage } from '../../server/services/images.js';
import { png } from './helpers.js';
const config = loadConfig();
const body = (options) => parse(generationSchema, { prompt: 'A small landscape', ...options });
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const payload = png.toString('base64');

test('OpenAI adapter uses user key, fixed host, and expected request fields', async () => {
  const transport = createTransport(config, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/images/generations');
    assert.equal(options.headers.Authorization, 'Bearer user-openai-key');
    assert.equal(options.redirect, 'manual');
    const request = JSON.parse(options.body);
    assert.equal(request.quality, 'low');
    assert.equal(request.n, 1);
    assert.equal(request.output_format, 'png');
    return json({ data: [{ b64_json: payload }] });
  });
  const output = await createGenerator(transport, config)(
    'user-openai-key',
    body({ quality: 'low' }),
  );
  assert.equal(output.width, 120);
  assert.equal(output.height, 60);
});
test('Gemini maps size to aspect ratio and reads inline image data', async () => {
  const transport = createTransport(config, async (url, options) => {
    assert.equal(
      url,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    );
    assert.equal(options.headers['x-goog-api-key'], 'user-gemini-key');
    assert.equal(JSON.parse(options.body).generationConfig.imageConfig.aspectRatio, '3:2');
    return json({
      candidates: [
        { content: { parts: [{ inlineData: { data: payload, mimeType: 'image/png' } }] } },
      ],
    });
  });
  assert.equal(
    (
      await createGenerator(transport, config)(
        'user-gemini-key',
        body({ provider: 'gemini', size: '1536x1024' }),
      )
    ).width,
    120,
  );
});
test('fal uses sync FLUX with explicit dimensions and inline output', async () => {
  const transport = createTransport(config, async (url, options) => {
    assert.equal(url, 'https://fal.run/fal-ai/flux/schnell');
    assert.equal(options.headers.Authorization, 'Key user-fal-key');
    const request = JSON.parse(options.body);
    assert.equal(request.sync_mode, true);
    assert.deepEqual(request.image_size, { width: 1024, height: 1536 });
    return json({ images: [{ url: 'data:image/png;base64,' + payload }] });
  });
  assert.equal(
    (
      await createGenerator(transport, config)(
        'user-fal-key',
        body({ provider: 'fal', size: '1024x1536' }),
      )
    ).height,
    60,
  );
});
test('fal never fetches arbitrary image URLs', async () => {
  let count = 0;
  const transport = createTransport(config, async () => {
    count++;
    return json({ images: [{ url: 'http://169.254.169.254/private' }] });
  });
  await assert.rejects(createGenerator(transport, config)('key', body({ provider: 'fal' })), {
    status: 502,
  });
  assert.equal(count, 1);
});
for (const [upstream, expected] of [
  [400, 400],
  [401, 424],
  [403, 424],
  [404, 400],
  [422, 400],
  [429, 429],
  [500, 502],
  [302, 502],
])
  test(`provider HTTP ${upstream} maps to sanitized ${expected}`, async () => {
    const transport = createTransport(config, async () =>
      json({ error: 'private-provider-information' }, upstream),
    );
    await assert.rejects(
      transport.post('https://api.openai.com/v1/images/generations', {}, {}),
      (error) =>
        error.status === expected && !error.message.includes('private-provider-information'),
    );
  });
test('invalid JSON, excessive responses and invalid images fail safely', async () => {
  const invalid = createTransport(config, async () => new Response('not JSON'));
  await assert.rejects(invalid.post('https://api.openai.com', {}, {}), { status: 502 });
  const large = createTransport(
    { ...config, providerResponseLimit: 3 },
    async () => new Response('12345'),
  );
  await assert.rejects(large.post('https://api.openai.com', {}, {}), { status: 502 });
  for (const value of ['not-base64', Buffer.from('not image').toString('base64'), ''])
    await assert.rejects(normalizeImage(value, config), { status: 502 });
});
test('provider timeout and connection errors are sanitized', async () => {
  const timeout = createTransport(config, async () => {
    throw new DOMException('sensitive timeout', 'TimeoutError');
  });
  await assert.rejects(timeout.post('https://api.openai.com', {}, {}), { status: 504 });
  const connection = createTransport(config, async () => {
    throw new Error('secret network info');
  });
  await assert.rejects(
    connection.post('https://api.openai.com', {}, {}),
    (error) => error.status === 503 && !error.message.includes('secret network info'),
  );
});
test('filtered Gemini responses and empty OpenAI output are explicit errors', async () => {
  const transport = createTransport(config, async () => json({ candidates: [], data: [] }));
  await assert.rejects(createGenerator(transport, config)('key', body({ provider: 'gemini' })), {
    status: 422,
  });
  await assert.rejects(createGenerator(transport, config)('key', body({ provider: 'openai' })), {
    status: 502,
  });
});
test('normalization strips metadata and limits decoded image pixels', async () => {
  const output = await normalizeImage(payload, config);
  assert.equal(output.width, 120);
  await assert.rejects(normalizeImage(payload, { ...config, maxPixels: 100 }), { status: 502 });
});

for (const code of [
  'credit_balance_exhausted',
  'organization_usage_limit_exceeded',
  'organization_spend_limit_exceeded',
  'project_spend_limit_exceeded',
  'billing_hard_limit_reached',
  'billing_not_active',
  'insufficient_quota',
])
  test(`OpenAI quota errors are identified: ${code}`, async () => {
    const transport = createTransport(config, async () =>
      json(
        { error: { code, type: 'insufficient_quota', message: 'sensitive sk-provider-secret' } },
        429,
      ),
    );
    await assert.rejects(
      transport.post('https://api.openai.com/v1/images/generations', {}, {}),
      (error) => {
        assert.equal(error.status, 429);
        assert.equal(error.providerCode, code);
        assert.ok(error.detail.includes(code));
        assert.ok(error.detail.includes('separate'));
        assert.ok(!error.detail.includes('sensitive'));
        assert.equal(error.headers['Retry-After'], undefined);
        return true;
      },
    );
  });
test('OpenAI temporary rate limit honors Retry-After and safe upstream request ID', async () => {
  const transport = createTransport(
    config,
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'rate_limit_exceeded',
            type: 'insufficient_quota',
            message: 'secret body',
          },
        }),
        { status: 429, headers: { 'Retry-After': '12.5', 'X-Request-ID': 'req_openai_123' } },
      ),
  );
  await assert.rejects(
    transport.post('https://api.openai.com/v1/images/generations', {}, {}),
    (error) =>
      error.status === 429 &&
      error.providerCode === 'rate_limit_exceeded' &&
      error.headers['Retry-After'] === '13' &&
      error.headers['X-Provider-Request-ID'] === 'req_openai_123' &&
      !error.detail.includes('secret body'),
  );
});
test('OpenAI type fallback is recognized when code is absent', async () => {
  const transport = createTransport(config, async () =>
    json({ error: { type: 'insufficient_quota' } }, 429),
  );
  await assert.rejects(
    transport.post('https://api.openai.com/v1/images/generations', {}, {}),
    (error) => error.providerCode === 'insufficient_quota',
  );
});
test('malformed, oversized, and non-JSON error bodies retain sanitized status mapping', async () => {
  for (const value of [
    'not JSON',
    'x'.repeat(20000),
    JSON.stringify({ error: { code: 'secret-unknown-code', message: 'sk-do-not-expose' } }),
  ]) {
    const transport = createTransport(config, async () => new Response(value, { status: 429 }));
    await assert.rejects(
      transport.post('https://api.openai.com/v1/images/generations', {}, {}),
      (error) =>
        error.status === 429 &&
        !error.detail.includes('sk-do-not-expose') &&
        !error.detail.includes('secret-unknown-code'),
    );
  }
});
test('non-OpenAI providers do not use OpenAI-specific billing classifications', async () => {
  const transport = createTransport(config, async () =>
    json({ error: { code: 'credit_balance_exhausted' } }, 429),
  );
  await assert.rejects(
    transport.post('https://fal.run/fal-ai/flux/schnell', {}, {}),
    (error) =>
      error.status === 429 && error.providerCode === undefined && !error.detail.includes('OpenAI'),
  );
});
