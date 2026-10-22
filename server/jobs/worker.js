import { providerKey } from '../services/provider-keys.js';
import { reserve, finish } from '../services/usage.js';
import { composePoster } from '../posters/composer.js';
import { artworkPrompt, planPoster } from '../posters/planner.js';
import { storeOutput, cleanupOutputs, removeOutput } from './storage.js';
import { postWebhook } from './webhooks.js';
import { jobView } from './view.js';
import { HttpError } from '../lib/errors.js';
export function startPosterWorker(ctx) {
  const active = new Set(),
    deliveries = new Set();
  let stopped = false,
    ticking = false;
  // An interrupted provider call may already have been billed: never replay it automatically.
  for (const row of ctx.db
    .prepare("SELECT id,usage_id FROM poster_jobs WHERE status='running'")
    .all()) {
    if (row.usage_id) finish(ctx, row.usage_id, 'unknown', 0, 'interrupted');
    ctx.db
      .prepare(
        "UPDATE poster_jobs SET status='unknown',stage='interrupted',error_json=?,updated_at=? WHERE id=?",
      )
      .run(
        JSON.stringify({
          status: 409,
          detail:
            'Generation was interrupted. The provider may have charged. This job was not automatically replayed.',
        }),
        ctx.now(),
        row.id,
      );
  }
  const update = (id, stage) =>
    ctx.db
      .prepare('UPDATE poster_jobs SET stage=?,updated_at=? WHERE id=?')
      .run(stage, ctx.now(), id);
  async function run(row) {
    let usageId = null;
    const started = performance.now();
    try {
      const { body, brand } = JSON.parse(ctx.encryption.decrypt(row.encrypted_input));
      if (
        row.api_key_id &&
        !ctx.db
          .prepare('SELECT id FROM api_keys WHERE id=? AND revoked_at IS NULL')
          .get(row.api_key_id)
      )
        throw new HttpError(401, 'The ImageAPI key that submitted this job was revoked.');
      const key = providerKey(ctx, row.user_id, body.provider);
      const plan = planPoster(body, brand);
      const size =
        body.provider === 'cloudflare'
          ? '1024x1024'
          : plan.width > plan.height
            ? '1536x1024'
            : plan.height > plan.width
              ? '1024x1536'
              : '1024x1024';
      const generation = {
        provider: body.provider,
        model: body.model,
        prompt: artworkPrompt(body, plan),
        size,
        quality: 'auto',
      };
      usageId = reserve(ctx, { userId: row.user_id, keyId: row.api_key_id }, generation);
      ctx.db.prepare('UPDATE poster_jobs SET usage_id=? WHERE id=?').run(usageId, row.id);
      update(row.id, 'generating_artwork');
      const image = await ctx.generateImage(key, generation);
      update(row.id, 'composing');
      const poster = await composePoster(image, body, brand);
      update(row.id, 'exporting');
      const formats = await storeOutput(ctx, row.id, poster.buffer);
      // If the user was deleted during processing, discard output immediately.
      if (!ctx.db.prepare('SELECT id FROM poster_jobs WHERE id=?').get(row.id)) {
        await removeOutput(ctx, row.id);
        return;
      }
      const result = { ...poster.design, formats, preferred_format: body.format };
      finish(ctx, usageId, 'success', performance.now() - started);
      ctx.db
        .prepare(
          "UPDATE poster_jobs SET status='completed',stage='ready',result_json=?,updated_at=?,webhook_state=? WHERE id=?",
        )
        .run(JSON.stringify(result), ctx.now(), body.webhook ? 'pending' : 'none', row.id);
    } catch (error) {
      const safe =
        error instanceof HttpError
          ? { status: error.status, detail: error.detail }
          : {
              status: 500,
              detail: 'Poster processing failed. No automatic provider retry was performed.',
            };
      if (usageId)
        finish(
          ctx,
          usageId,
          error.status === 504 ? 'unknown' : 'failed',
          performance.now() - started,
          error.providerCode || String(error.status || 500),
        );
      ctx.db
        .prepare(
          "UPDATE poster_jobs SET status=?,stage='failed',error_json=?,updated_at=?,webhook_state=CASE WHEN encrypted_input IS NOT NULL THEN ? ELSE 'none' END WHERE id=?",
        )
        .run(
          error.status === 504 ? 'unknown' : 'failed',
          JSON.stringify(safe),
          ctx.now(),
          JSON.parse(ctx.encryption.decrypt(row.encrypted_input)).body.webhook ? 'pending' : 'none',
          row.id,
        );
    }
  }
  async function deliver(row) {
    let success = false;
    try {
      const { body } = JSON.parse(ctx.encryption.decrypt(row.encrypted_input));
      const view = jobView(ctx, row);
      const payload = {
        event_id: `${row.id}.${row.status}`,
        type: `poster.${row.status}`,
        created_at: ctx.now(),
        job: { id: view.id, status: view.status, error: view.error, result: view.result },
      };
      success = await postWebhook(body.webhook.url, body.webhook.secret, payload, { now: ctx.now });
    } catch {
      /* Delivery failures are retried, generation is never retried here. */
    }
    const attempts = row.webhook_attempts + 1;
    const delays = [5, 30, 120, 600, 3600];
    ctx.db
      .prepare(
        'UPDATE poster_jobs SET webhook_state=?,webhook_attempts=?,webhook_next_at=? WHERE id=?',
      )
      .run(
        success ? 'delivered' : attempts >= 5 ? 'failed' : 'pending',
        attempts,
        ctx.now() + delays[Math.min(attempts - 1, 4)],
        row.id,
      );
  }
  async function tick() {
    if (stopped || ticking) return;
    ticking = true;
    try {
      await cleanupOutputs(ctx);
      const candidates = ctx.db
        .prepare("SELECT * FROM poster_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 100")
        .all();
      for (const row of candidates) {
        if (row.expires_at <= ctx.now()) {
          ctx.db
            .prepare(
              "UPDATE poster_jobs SET status='expired',stage='expired',encrypted_input=NULL WHERE id=?",
            )
            .run(row.id);
          continue;
        }
        if (active.size >= ctx.config.posterWorkers) break;
        const pending = ctx.db
          .prepare("SELECT COUNT(*) AS n FROM usage WHERE user_id=? AND status='pending'")
          .get(row.user_id).n;
        if (pending >= ctx.config.concurrency) continue;
        const claimed = ctx.db
          .prepare(
            "UPDATE poster_jobs SET status='running',stage='preparing',updated_at=? WHERE id=? AND status='queued'",
          )
          .run(ctx.now(), row.id);
        if (!claimed.changes) continue;
        const task = run(row)
          .catch(() => {})
          .finally(() => active.delete(task));
        active.add(task);
      }
      const callbacks = ctx.db
        .prepare(
          "SELECT * FROM poster_jobs WHERE webhook_state='pending' AND webhook_next_at<=? AND encrypted_input IS NOT NULL LIMIT 4",
        )
        .all(ctx.now());
      for (const row of callbacks)
        if (!deliveries.has(row.id)) {
          deliveries.add(row.id);
          const task = deliver(row)
            .catch(() => {})
            .finally(() => {
              deliveries.delete(row.id);
              activeDeliveries.delete(task);
            });
          activeDeliveries.add(task);
        }
    } finally {
      ticking = false;
    }
  }
  const activeDeliveries = new Set();
  const timer = setInterval(() => tick().catch(() => {}), ctx.config.jobInterval).unref();
  return {
    kick: () => tick(),
    async close() {
      stopped = true;
      clearInterval(timer);
      while (ticking) await new Promise((resolve) => setTimeout(resolve, 10));
      await Promise.allSettled([...active, ...activeDeliveries]);
    },
  };
}
