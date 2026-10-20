import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function start(port, dataDir) {
  const child = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      IMAGEAPI_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
      IMAGEAPI_DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const exited = once(child, 'exit');
  return { child, exited, output: () => ({ stdout, stderr }) };
}
async function ready(runtime) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (runtime.output().stdout.includes('ImageAPI is running')) return;
    if (runtime.child.exitCode !== null)
      throw new Error('Server exited: ' + runtime.output().stderr);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('Server did not become ready');
}

test(
  'production entry point serves Node health and shuts down cleanly',
  { timeout: 20000 },
  async (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'imageapi-startup-')),
      port = await freePort(),
      runtime = start(port, dir);
    t.after(() => {
      if (runtime.child.exitCode === null) runtime.child.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    });
    await ready(runtime);
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).runtime, 'node');
    runtime.child.kill('SIGTERM');
    const [code] = await runtime.exited;
    assert.equal(code, 0);
    assert.match(runtime.output().stdout, /Finishing active requests/);
  },
);
test(
  'a busy port fails with a clear error instead of another server',
  { timeout: 20000 },
  async (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'imageapi-busy-')),
      otherDir = mkdtempSync(path.join(tmpdir(), 'imageapi-busy-other-')),
      port = await freePort(),
      first = start(port, dir);
    t.after(() => {
      if (first.child.exitCode === null) first.child.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
      rmSync(otherDir, { recursive: true, force: true });
    });
    await ready(first);
    const second = start(port, otherDir);
    t.after(() => {
      if (second.child.exitCode === null) second.child.kill('SIGKILL');
    });
    const [code] = await second.exited;
    assert.equal(code, 1);
    assert.match(second.output().stderr, new RegExp(`Port ${port} is in use`));
    first.child.kill('SIGTERM');
    await first.exited;
  },
);
