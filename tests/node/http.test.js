import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, register } from './helpers.js';
import { loadConfig } from '../../server/config/index.js';

test('all frontend routes and static modules load with security headers', async (t) => {
  const env = setup(t);
  for (const path of [
    '/',
    '/pricing',
    '/login',
    '/signup',
    '/recover',
    '/dashboard',
    '/api',
    '/playground',
    '/settings',
    '/docs',
    '/static/js/app.js',
    '/static/css/base.css',
  ]) {
    const response = await env.request.get(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers['x-frame-options'], 'DENY');
    assert.ok(response.headers['content-security-policy'].includes("script-src 'self'"));
    assert.equal(response.headers['x-powered-by'], undefined);
  }
  assert.equal((await env.request.get('/not-a-page')).status, 404);
  assert.equal((await env.request.get('/api/not-a-route')).status, 404);
  assert.equal((await env.request.get('/static/missing-file')).status, 404);
  assert.ok([403, 404].includes((await env.request.get('/static/../package.json')).status));
});
test('health identifies Node and only Free is an active plan', async (t) => {
  const env = setup(t);
  assert.deepEqual((await env.request.get('/health')).body, {
    status: 'ok',
    version: '1.0.0',
    runtime: 'node',
  });
  const plans = (await env.request.get('/api/plans')).body.plans;
  assert.deepEqual(
    plans.filter((p) => p.available).map((p) => p.id),
    ['free'],
  );
  assert.deepEqual(
    (await env.request.get('/api/catalog')).body.providers.map((p) => p.id),
    ['openai', 'gemini', 'cloudflare', 'fal'],
  );
});
test('OpenAPI documents bearer authentication and generation options', async (t) => {
  const env = setup(t),
    schema = (await env.request.get('/openapi.json')).body;
  assert.equal(schema.components.securitySchemes.ImageAPIKey.scheme, 'bearer');
  assert.deepEqual(schema.paths['/v1/images/generations'].post.security[0], { ImageAPIKey: [] });
  assert.equal(schema.components.schemas.GenerationRequest.additionalProperties, false);
  assert.equal((await env.request.get('/api/reference')).status, 302);
});
test('oversize JSON and malformed JSON return bounded, sanitized errors', async (t) => {
  const env = setup(t);
  const big = await env.request
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ email: 'x', password: 'a'.repeat(1024 * 1024) }));
  assert.equal(big.status, 413);
  assert.equal(big.headers['cache-control'], 'no-store');
  const malformed = await env.request
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{secret');
  assert.equal(malformed.status, 400);
  assert.ok(!malformed.text.includes('{secret'));
});
test('invalid origins and insecure secure-cookie configuration fail at startup', () => {
  for (const origin of [
    'http://example.com/path',
    'http://example.com/',
    'ftp://example.com',
    'http://user:pass@example.com',
  ])
    assert.throws(() => loadConfig({ publicOrigin: origin }));
  assert.throws(() => loadConfig({ secureCookies: true, publicOrigin: 'http://example.com' }));
  assert.equal(loadConfig({ port: 8080, publicOrigin: 'http://127.0.0.1:8080' }).port, 8080);
});
test('invalid bearer schemes and tokens never fall back to a valid cookie session', async (t) => {
  const env = setup(t);
  await register(env);
  for (const header of ['Basic test', 'Bearer bad', 'Bearer ia_live_short'])
    assert.equal(
      (
        await env.agent
          .post('/v1/images/generations')
          .set('Authorization', header)
          .send({ prompt: 'cat' })
      ).status,
      401,
    );
});

test('malformed structured session cookies are treated as unauthenticated', async (t) => {
  const env = setup(t);
  for (const cookie of ['imageapi_session=j:%7B%22x%22%3A1%7D', 'imageapi_session=j:%5B1%5D'])
    assert.equal((await env.request.get('/api/auth/me').set('Cookie', cookie)).status, 401);
});
