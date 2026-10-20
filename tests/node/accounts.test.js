import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { readFileSync, statSync } from 'node:fs';
import { setup, register, session, connect } from './helpers.js';
import { hash } from '../../server/security/tokens.js';

test('registration returns one-time credentials and an HttpOnly session', async (t) => {
  const env = setup(t),
    account = await register(env);
  assert.match(account.api_key, /^ia_live_/);
  assert.match(account.recovery_code, /^iar_/);
  const me = await env.agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, account.email);
  assert.equal(me.body.csrf, account.csrf);
  const row = env.context.db.prepare('SELECT * FROM users').get();
  assert.ok(row.password_hash.startsWith('scrypt$'));
  assert.notEqual(row.password_hash, account.password);
  assert.equal(row.recovery_hash, hash(account.recovery_code));
  assert.equal(
    env.context.db.prepare('SELECT token_hash FROM api_keys').get().token_hash,
    hash(account.api_key),
  );
  assert.equal(statSync(env.dataDir + '/imageapi.sqlite3').mode & 0o077, 0);
});
test('duplicate email, weak passwords, invalid email and blank names fail', async (t) => {
  const env = setup(t),
    account = await register(env);
  assert.equal(
    (
      await env.agent
        .post('/api/auth/register')
        .send({ email: account.email, name: 'Alex', password: account.password })
    ).status,
    409,
  );
  for (const body of [
    { email: 'invalid', name: 'A', password: account.password },
    { email: 'new@example.com', name: 'A', password: 'weak' },
    { email: 'new@example.com', name: '   ', password: account.password },
  ])
    assert.equal((await env.request.post('/api/auth/register').send(body)).status, 422);
});
test('session writes require CSRF and same-origin requests', async (t) => {
  const env = setup(t),
    account = await register(env);
  assert.equal((await env.agent.post('/api/keys').send({ name: 'bad' })).status, 403);
  assert.equal(
    (
      await session(env.agent, account, 'post', '/api/keys')
        .set('Origin', 'https://evil.example')
        .send({ name: 'bad' })
    ).status,
    403,
  );
  assert.equal(
    (
      await session(env.agent, account, 'post', '/api/keys')
        .set('Origin', 'http://testserver')
        .send({ name: 'good' })
    ).status,
    201,
  );
  assert.equal(
    (
      await env.request
        .post('/api/auth/login')
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ email: account.email, password: account.password })
    ).status,
    403,
  );
});
test('login, case-insensitive email, wrong credentials, and logout', async (t) => {
  const env = setup(t),
    account = await register(env);
  const login = await env.request
    .post('/api/auth/login')
    .send({ email: account.email.toUpperCase(), password: account.password });
  assert.equal(login.status, 200);
  assert.match(login.headers['set-cookie'][0], /HttpOnly/);
  assert.match(login.headers['set-cookie'][0], /SameSite=Lax/);
  assert.notEqual(login.body.csrf, account.csrf);
  for (const email of [account.email, 'missing@example.com'])
    assert.equal(
      (await env.request.post('/api/auth/login').send({ email, password: 'wrong' })).status,
      401,
    );
  assert.equal((await session(env.agent, account, 'post', '/api/auth/logout')).status, 204);
  assert.equal((await env.agent.get('/api/auth/me')).status, 401);
});
test('password change revokes all sessions but preserves ImageAPI keys', async (t) => {
  const env = setup(t),
    account = await register(env);
  await connect(env, account);
  assert.equal(
    (
      await session(env.agent, account, 'post', '/api/auth/password').send({
        current_password: 'bad',
        new_password: 'new-password-123',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await session(env.agent, account, 'post', '/api/auth/password').send({
        current_password: account.password,
        new_password: 'new-password-123',
      })
    ).status,
    204,
  );
  assert.equal((await env.agent.get('/api/auth/me')).status, 401);
  assert.equal(
    (
      await env.request
        .post('/api/auth/login')
        .send({ email: account.email, password: 'new-password-123' })
    ).status,
    200,
  );
  assert.equal(
    (
      await env.request
        .post('/v1/images/generations')
        .set('Authorization', 'Bearer ' + account.api_key)
        .send({ prompt: 'cat' })
    ).status,
    200,
  );
});
test('recovery rotates the code, rejects reuse and revokes sessions and keys', async (t) => {
  const env = setup(t),
    account = await register(env);
  const body = {
    email: account.email,
    password: 'replacement-password-123',
    recovery_code: account.recovery_code,
  };
  const result = await env.request.post('/api/auth/recover').send(body);
  assert.equal(result.status, 200);
  assert.notEqual(result.body.recovery_code, account.recovery_code);
  assert.equal((await env.agent.get('/api/auth/me')).status, 401);
  assert.equal(
    (
      await env.request
        .post('/v1/images/generations')
        .set('Authorization', 'Bearer ' + account.api_key)
        .send({ prompt: 'cat' })
    ).status,
    401,
  );
  assert.equal((await env.request.post('/api/auth/recover').send(body)).status, 400);
  assert.equal(
    (
      await env.request
        .post('/api/auth/login')
        .send({ email: account.email, password: body.password })
    ).status,
    200,
  );
});
test('account deletion requires password and cascades all records', async (t) => {
  const env = setup(t),
    account = await register(env);
  await connect(env, account);
  await session(env.agent, account, 'post', '/v1/images/generations').send({ prompt: 'cat' });
  assert.equal(
    (await session(env.agent, account, 'delete', '/api/auth/account').send({ password: 'bad' }))
      .status,
    400,
  );
  assert.equal(
    (
      await session(env.agent, account, 'delete', '/api/auth/account').send({
        password: account.password,
      })
    ).status,
    204,
  );
  for (const table of ['users', 'sessions', 'api_keys', 'provider_keys', 'usage'])
    assert.equal(env.context.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
  assert.equal((await env.agent.get('/api/auth/me')).status, 401);
});
test('expired sessions cannot access account data', async (t) => {
  const env = setup(t);
  await register(env);
  env.context.db.prepare('UPDATE sessions SET expires_at=0').run();
  assert.equal((await env.agent.get('/api/auth/me')).status, 401);
});
test('persistent login rate limit and Retry-After', async (t) => {
  const env = setup(t);
  for (let i = 0; i < 15; i++)
    assert.equal(
      (
        await env.request
          .post('/api/auth/login')
          .send({ email: 'missing@example.com', password: 'wrong' })
      ).status,
      401,
    );
  const response = await env.request
    .post('/api/auth/login')
    .send({ email: 'missing@example.com', password: 'wrong' });
  assert.equal(response.status, 429);
  assert.ok(response.headers['retry-after']);
});
test('validation never echoes passwords or provider credentials', async (t) => {
  const env = setup(t),
    account = await register(env);
  const response = await session(env.agent, account, 'put', '/api/providers/openai').send({
    api_key: 'private secret with spaces',
  });
  assert.equal(response.status, 422);
  assert.ok(!response.text.includes('private secret with spaces'));
  const weak = await env.request
    .post('/api/auth/register')
    .send({ email: 'x', name: 'A', password: 'weak-secret' });
  assert.ok(!weak.text.includes('weak-secret'));
});
test('HTTPS configuration sets secure cookies and HSTS', async (t) => {
  const env = setup(t, { config: { publicOrigin: 'https://testserver', secureCookies: true } });
  const result = await env.request
    .post('/api/auth/register')
    .send({ email: 'secure@example.com', name: 'Alex', password: 'a-safe-password-123' });
  assert.equal(result.status, 201);
  assert.match(result.headers['set-cookie'][0], /Secure/);
  assert.ok(result.headers['strict-transport-security']);
});
test('provider credentials are encrypted and never returned in full', async (t) => {
  const env = setup(t),
    account = await register(env);
  await connect(env, account, 'openai', 'sk-encrypted-fixture-1234');
  const row = env.context.db.prepare('SELECT encrypted_key FROM provider_keys').get();
  assert.ok(row.encrypted_key.startsWith('v2:'));
  assert.ok(!row.encrypted_key.includes('sk-encrypted-fixture-1234'));
  assert.equal(env.context.encryption.decrypt(row.encrypted_key), 'sk-encrypted-fixture-1234');
  const listing = await env.agent.get('/api/providers');
  assert.ok(!listing.text.includes('sk-encrypted-fixture-1234'));
  assert.equal(listing.body.providers[0].hint, '••••1234');
  assert.equal((await session(env.agent, account, 'delete', '/api/providers/openai')).status, 204);
  assert.equal((await env.agent.get('/api/providers')).body.providers[0].connected, false);
});
test('account isolation for provider keys, ImageAPI keys and usage', async (t) => {
  const env = setup(t),
    first = await register(env);
  await connect(env, first);
  await session(env.agent, first, 'post', '/v1/images/generations').send({ prompt: 'cat' });
  const firstKey = (await env.agent.get('/api/keys')).body.keys[0].id;
  const other = { ...env, agent: request.agent(env.app) },
    second = await register(other);
  assert.ok(
    (await other.agent.get('/api/providers')).body.providers.every(
      (provider) => !provider.connected,
    ),
  );
  assert.equal((await other.agent.get('/api/usage')).body.summary.requests, 0);
  assert.equal((await session(other.agent, second, 'delete', '/api/keys/' + firstKey)).status, 404);
  assert.ok((await other.agent.get('/api/keys')).body.keys.every((key) => key.id !== firstKey));
});
test('key cap, revocation, masked identifiers, and bearer scope', async (t) => {
  const env = setup(t, { config: { maxApiKeys: 2 } }),
    account = await register(env);
  await connect(env, account);
  const second = await session(env.agent, account, 'post', '/api/keys').send({ name: 'Second' });
  assert.equal(second.status, 201);
  assert.equal(
    (await session(env.agent, account, 'post', '/api/keys').send({ name: 'Third' })).status,
    409,
  );
  assert.equal(
    (await session(env.agent, account, 'delete', '/api/keys/' + second.body.id)).status,
    204,
  );
  assert.equal(
    (await session(env.agent, account, 'post', '/api/keys').send({ name: 'Replacement' })).status,
    201,
  );
  assert.ok(!(await env.agent.get('/api/keys')).text.includes(account.api_key));
  assert.equal(
    (await env.request.get('/api/providers').set('Authorization', 'Bearer ' + account.api_key))
      .status,
    401,
  );
  assert.equal(
    (
      await env.request
        .post('/v1/images/generations')
        .set('Authorization', 'Bearer ' + second.body.api_key)
        .send({ prompt: 'cat' })
    ).status,
    401,
  );
});
