import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { schema } from '../../server/db/schema.js';
import { createApp } from '../../server/app.js';
import { hash, token } from '../../server/security/tokens.js';
import { verifyPassword } from '../../server/security/passwords.js';
import { loadEncryption } from '../../server/security/encryption.js';
import { setup, register, connect } from './helpers.js';
const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/legacy-account.json', import.meta.url), 'utf8'),
);

test('Node verifies passwords produced by the original Python scrypt implementation', async () => {
  assert.equal(await verifyPassword(fixture.password, fixture.password_hash), true);
  assert.equal(await verifyPassword('wrong', fixture.password_hash), false);
});
test('Node decrypts real Fernet fixtures and detects tampering', () => {
  const cipher = loadEncryption({ encryptionKey: fixture.encryption_key, dataDir: '/not-used' });
  assert.equal(cipher.decrypt(fixture.encrypted_key), fixture.provider_key);
  const tampered = Buffer.from(fixture.encrypted_key, 'base64url');
  tampered[30] ^= 1;
  assert.throws(() => cipher.decrypt(tampered.toString('base64url')));
  const encrypted = cipher.encrypt(fixture.provider_key);
  assert.match(encrypted, /^v2:/);
  assert.equal(cipher.decrypt(encrypted), fixture.provider_key);
  const changed = Buffer.from(encrypted.slice(3), 'base64url');
  changed[15] ^= 1;
  assert.throws(() => cipher.decrypt('v2:' + changed.toString('base64url')));
});
test('legacy database migrates with backup and preserves accounts, sessions, keys and usage', async (t) => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'imageapi-migration-'));
  const filename = path.join(dataDir, 'imageapi.sqlite3');
  const legacy = new DatabaseSync(filename);
  legacy.exec(schema);
  legacy.exec('PRAGMA user_version=1');
  const now = Math.floor(Date.now() / 1000),
    apiKey = 'ia_live_' + token(),
    sessionToken = token(),
    csrf = token();
  legacy
    .prepare(
      'INSERT INTO users(id,email,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)',
    )
    .run(
      'legacy-user',
      'legacy@example.com',
      'Legacy User',
      fixture.password_hash,
      hash('legacy-recovery-code'),
      now,
    );
  legacy
    .prepare(
      'INSERT INTO api_keys(id,user_id,name,token_hash,prefix,created_at) VALUES (?,?,?,?,?,?)',
    )
    .run('legacy-key', 'legacy-user', 'Original key', hash(apiKey), 'ia_live_masked', now);
  legacy
    .prepare('INSERT INTO sessions VALUES (?,?,?,?)')
    .run(hash(sessionToken), 'legacy-user', csrf, now + 3600);
  legacy
    .prepare('INSERT INTO provider_keys VALUES (?,?,?,?,?)')
    .run('legacy-user', 'openai', fixture.encrypted_key, '••••only', now);
  legacy
    .prepare(
      'INSERT INTO usage(id,user_id,api_key_id,provider,model,size,source,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .run(
      'req_legacy',
      'legacy-user',
      'legacy-key',
      'openai',
      'gpt-image-1',
      '1024x1024',
      'api',
      'success',
      now,
    );
  legacy.close();
  writeFileSync(path.join(dataDir, 'encryption.key'), fixture.encryption_key, { mode: 0o600 });
  let usedKey;
  const runtime = createApp({
    config: { dataDir, publicOrigin: 'http://testserver' },
    generateImage: async (key) => {
      usedKey = key;
      return { encoded: 'test-only', width: 1, height: 1 };
    },
  });
  t.after(async () => {
    await runtime.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  assert.equal(runtime.context.db.prepare('PRAGMA user_version').get().user_version, 3);
  const backups = readdirSync(path.join(dataDir, 'backups'));
  assert.equal(backups.length, 2);
  const backup = new DatabaseSync(
    path.join(
      dataDir,
      'backups',
      backups.find((file) => file.endsWith('.sqlite3')),
    ),
    { readOnly: true },
  );
  assert.equal(
    backup.prepare('SELECT password_hash FROM users').get().password_hash,
    fixture.password_hash,
  );
  backup.close();
  const cookie = 'imageapi_session=' + sessionToken;
  assert.equal((await request(runtime.app).get('/api/auth/me').set('Cookie', cookie)).status, 200);
  assert.equal(
    (await request(runtime.app).get('/api/usage').set('Cookie', cookie)).body.summary.images,
    1,
  );
  const result = await request(runtime.app)
    .post('/v1/images/generations')
    .set('Authorization', 'Bearer ' + apiKey)
    .send({ prompt: 'cat' });
  assert.equal(result.status, 200);
  assert.equal(usedKey, fixture.provider_key);
  assert.ok(
    runtime.context.db
      .prepare('SELECT encrypted_key FROM provider_keys')
      .get()
      .encrypted_key.startsWith('v2:'),
  );
  assert.equal(
    (
      await request(runtime.app)
        .post('/api/auth/login')
        .send({ email: 'legacy@example.com', password: fixture.password })
    ).status,
    200,
  );
  assert.ok(
    runtime.context.db
      .prepare('SELECT password_hash FROM users')
      .get()
      .password_hash.startsWith('scrypt$'),
  );
});
test('new accounts, encryption keys and credentials persist across restarts', async (t) => {
  const env = setup(t),
    account = await register(env);
  await connect(env, account);
  const dir = env.dataDir;
  await env.close();
  const runtime = createApp({ config: { dataDir: dir, publicOrigin: 'http://testserver' } });
  t.after(() => runtime.close());
  const agent = request.agent(runtime.app),
    login = await agent
      .post('/api/auth/login')
      .send({ email: account.email, password: account.password });
  assert.equal(login.status, 200);
  assert.equal((await agent.get('/api/providers')).body.providers[0].connected, true);
  const key = runtime.context.db.prepare('SELECT encrypted_key FROM provider_keys').get();
  assert.equal(runtime.context.encryption.decrypt(key.encrypted_key), 'sk-user-fixture-only');
});
test('newer database schemas are rejected without alteration', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'imageapi-newer-'));
  const db = new DatabaseSync(path.join(dir, 'imageapi.sqlite3'));
  db.exec('PRAGMA user_version=99');
  db.close();
  assert.throws(() => createApp({ config: { dataDir: dir } }), /newer/);
  rmSync(dir, { recursive: true, force: true });
});
