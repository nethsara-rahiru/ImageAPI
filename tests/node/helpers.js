import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../../server/app.js';
export const png = await sharp({
  create: { width: 120, height: 60, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } },
})
  .png()
  .toBuffer();
export function setup(t, options = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'imageapi-test-'));
  const calls = [];
  const generateImage =
    options.generateImage ||
    async function (key, body) {
      calls.push({ key, body });
      return { encoded: png.toString('base64'), width: 120, height: 60 };
    };
  const runtime = createApp({
    ...options,
    generateImage,
    config: { dataDir, publicOrigin: 'http://testserver', ...options.config },
  });
  t.after(async () => {
    await runtime.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  return {
    ...runtime,
    calls,
    agent: request.agent(runtime.app),
    request: request(runtime.app),
    dataDir,
  };
}
let sequence = 0;
export async function register(
  env,
  {
    email = `alex-${++sequence}@example.com`,
    name = 'Alex Morgan',
    password = 'a-safe-password-123',
  } = {},
) {
  const response = await env.agent.post('/api/auth/register').send({ email, name, password });
  if (response.status !== 201)
    throw new Error('Registration failed: ' + JSON.stringify(response.body));
  return { ...response.body, email, password };
}
export function session(agent, account, method, url) {
  return agent[method](url).set('X-CSRF-Token', account.csrf);
}
export async function connect(env, account, provider = 'openai', key = 'sk-user-fixture-only') {
  const result = await session(env.agent, account, 'put', '/api/providers/' + provider).send({
    api_key: key,
  });
  if (result.status !== 200)
    throw new Error('Provider save failed: ' + JSON.stringify(result.body));
}
