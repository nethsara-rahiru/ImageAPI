// Node 24+. Usage: IMAGEAPI_KEY=ia_live_... IMAGEAPI_BASE_URL=http://localhost:8080 node examples/poster.mjs
import { writeFile } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';
const base = process.env.IMAGEAPI_BASE_URL || 'http://127.0.0.1:8080';
const key = process.env.IMAGEAPI_KEY;
if (!key)
  throw new Error(
    'Set IMAGEAPI_KEY to your own ImageAPI bearer key. Save your provider credentials in Settings first.',
  );
const idempotency = crypto.randomUUID();
async function request(path, options = {}) {
  const response = await fetch(new URL(path, base), {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`ImageAPI HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}
const body = {
  provider: process.env.IMAGEAPI_PROVIDER || 'cloudflare',
  prompt:
    'A floating botanical greenhouse above a pale blue ocean at sunrise, editorial photography',
  headline: 'BOTANICAL FUTURES',
  subtitle: 'Nature. Architecture. Possibility.',
  details: ['16 NOVEMBER · 10 AM–6 PM', 'THE GLASSHOUSE GALLERY'],
  cta: 'DISCOVER THE EXHIBITION',
  size: 'portrait',
  layout: 'auto',
  retention_hours: 24,
};
let job;
// Retrying this submission with the SAME key cannot create a second job.
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    job = await request('/v1/posters', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotency },
      body: JSON.stringify(body),
    });
    break;
  } catch (error) {
    if (attempt === 2 || !['TimeoutError', 'TypeError', 'AbortError'].includes(error.name))
      throw error;
    await pause(1000 * (attempt + 1));
  }
}
console.log(`Job ${job.id} submitted. Waiting for the final poster…`);
const deadline = Date.now() + 15 * 60 * 1000;
while (['queued', 'running'].includes(job.status)) {
  if (Date.now() > deadline)
    throw new Error(
      `Polling deadline reached. Job ${job.id} keeps running; poll its status rather than submitting another generation.`,
    );
  await pause(2000);
  job = await request('/v1/posters/' + job.id);
}
if (job.status !== 'completed')
  throw new Error(`${job.status}: ${job.error?.detail || 'Output unavailable'}`);
const response = await fetch(new URL(`/v1/posters/${job.id}/output/png`, base), {
  headers: { Authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
await writeFile('poster.png', Buffer.from(await response.arrayBuffer()));
console.log(
  `Saved poster.png (${job.result.width} × ${job.result.height}). Layout: ${job.result.layout}. Quality checks passed: ${job.result.quality.passed}.`,
);
