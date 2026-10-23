import { Router } from 'express';
import { imageAuth } from '../auth/middleware.js';
import { parse, z } from '../lib/validation.js';
import { posterSchema } from '../posters/schema.js';
import { posterCatalog } from '../posters/catalog.js';
import { preflightPoster } from '../posters/composer.js';
import { readBrand } from '../posters/brands.js';
import { providerKey } from '../services/provider-keys.js';
import { monthStart } from '../services/usage.js';
import { rateLimit } from '../services/rate-limit.js';
import { transaction } from '../db/index.js';
import { hash, id } from '../security/tokens.js';
import { HttpError } from '../lib/errors.js';
import { jobView } from '../jobs/view.js';
import { resolveWebhook } from '../jobs/webhooks.js';
import { readOutput, removeOutput, verifyDownload } from '../jobs/storage.js';
const canonical = (value) =>
  Array.isArray(value)
    ? '[' + value.map(canonical).join(',') + ']'
    : value && typeof value === 'object'
      ? '{' +
        Object.keys(value)
          .sort()
          .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
          .join(',') +
        '}'
      : JSON.stringify(value);
function ownJob(ctx, auth, id) {
  const row = ctx.db
    .prepare('SELECT * FROM poster_jobs WHERE id=? AND user_id=?')
    .get(id, auth.userId);
  if (!row) throw new HttpError(404, 'Poster job not found');
  return row;
}
export function posters(ctx) {
  const router = Router();
  router.use(imageAuth(ctx));
  router.get('/catalog', (req, res) => res.json(posterCatalog()));
  router.get('/', (req, res) => {
    const { limit, offset } = parse(
      z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
      }),
      req.query,
      'query',
    );
    const rows = ctx.db
      .prepare(
        'SELECT * FROM poster_jobs WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',
      )
      .all(req.auth.userId, limit, offset);
    res.json({
      jobs: rows.map((row) => jobView(ctx, row)),
      total: ctx.db
        .prepare('SELECT COUNT(*) AS n FROM poster_jobs WHERE user_id=?')
        .get(req.auth.userId).n,
      limit,
      offset,
    });
  });
  router.post('/', async (req, res) => {
    const body = parse(posterSchema, req.body);
    const hashBody = { ...body };
    if (!hashBody.features?.length) delete hashBody.features;
    const requestHash = hash(canonical(hashBody));
    const idempotency = req.get('Idempotency-Key') || null;
    if (idempotency && !/^[A-Za-z0-9_.:-]{8,128}$/.test(idempotency))
      throw new HttpError(
        422,
        'Idempotency-Key must be 8–128 letters, digits, dots, underscores, colons, or hyphens',
      );
    const replay = () => {
      if (!idempotency) return null;
      const row = ctx.db
        .prepare('SELECT * FROM poster_jobs WHERE user_id=? AND idempotency_key=?')
        .get(req.auth.userId, idempotency);
      if (row && row.request_hash !== requestHash)
        throw new HttpError(
          409,
          'This Idempotency-Key was already used with different poster content',
        );
      return row;
    };
    const existing = replay();
    if (existing) {
      res.set('Idempotency-Replayed', 'true');
      return res.status(200).json(jobView(ctx, existing));
    }
    rateLimit(ctx, 'poster:' + req.auth.userId, 20, 60);
    providerKey(ctx, req.auth.userId, body.provider);
    const brand = readBrand(ctx, req.auth.userId, body.brand_id);
    preflightPoster(body, brand);
    if (body.webhook) await resolveWebhook(body.webhook.url);
    const row = transaction(ctx.db, () => {
      const duplicate = replay();
      if (duplicate) return duplicate;
      const count = ctx.db
        .prepare(
          "SELECT COUNT(*) AS n FROM poster_jobs WHERE user_id=? AND status IN ('queued','running')",
        )
        .get(req.auth.userId).n;
      if (count >= ctx.config.posterQueueLimit)
        throw new HttpError(429, 'Your poster queue is full. Wait for jobs to finish.');
      const retained = ctx.db
        .prepare(
          'SELECT COUNT(*) AS n FROM poster_jobs WHERE user_id=? AND encrypted_input IS NOT NULL',
        )
        .get(req.auth.userId).n;
      if (retained >= 100)
        throw new HttpError(
          429,
          'You have 100 retained poster inputs. Delete old jobs or wait for their retention period to expire.',
        );
      const used = ctx.db
        .prepare(
          "SELECT COUNT(*) AS n FROM usage WHERE user_id=? AND created_at>=? AND status IN ('success','pending','unknown')",
        )
        .get(req.auth.userId, monthStart(ctx.now())).n;
      const queued = ctx.db
        .prepare("SELECT COUNT(*) AS n FROM poster_jobs WHERE user_id=? AND status='queued'")
        .get(req.auth.userId).n;
      if (used + queued >= ctx.config.freeLimit)
        throw new HttpError(
          429,
          'Your monthly allowance is used or reserved by queued work. Wait for a job to fail/cancel or for the next UTC month.',
        );
      const jobId = 'poster_' + id(),
        now = ctx.now();
      ctx.db
        .prepare(
          "INSERT INTO poster_jobs(id,user_id,api_key_id,idempotency_key,request_hash,encrypted_input,status,stage,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,'queued','queued',?,?,?)",
        )
        .run(
          jobId,
          req.auth.userId,
          req.auth.keyId,
          idempotency,
          requestHash,
          ctx.encryption.encrypt(JSON.stringify({ body, brand })),
          now,
          now,
          now + body.retention_hours * 3600,
        );
      return ctx.db.prepare('SELECT * FROM poster_jobs WHERE id=?').get(jobId);
    });
    res
      .set('Location', `/v1/posters/${row.id}`)
      .set('Retry-After', '2')
      .status(202)
      .json(jobView(ctx, row));
    ctx.posterWorker.kick().catch(() => {});
  });
  router.get('/:id', (req, res) => res.json(jobView(ctx, ownJob(ctx, req.auth, req.params.id))));
  router.get('/:id/output/:format', async (req, res) => {
    const row = ownJob(ctx, req.auth, req.params.id);
    if (row.status !== 'completed' || row.expires_at <= ctx.now())
      throw new HttpError(410, 'Poster output is not available');
    await sendOutput(ctx, row, req.params.format, res);
  });
  router.delete('/:id', async (req, res) => {
    const row = ownJob(ctx, req.auth, req.params.id);
    if (row.status === 'running')
      throw new HttpError(
        409,
        'A running provider request cannot be safely cancelled. Wait for it to finish before deleting.',
      );
    ctx.db
      .prepare(
        "UPDATE poster_jobs SET status='deleted',stage='deleted',encrypted_input=NULL,result_json=NULL,error_json=NULL,webhook_state='none',updated_at=? WHERE id=?",
      )
      .run(ctx.now(), row.id);
    await removeOutput(ctx, row.id);
    res.sendStatus(204);
  });
  return router;
}
async function sendOutput(ctx, row, format, res) {
  let buffer;
  try {
    buffer = await readOutput(ctx, row.id, format);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(410, 'Poster file is no longer available');
  }
  res
    .set({
      'Content-Type': `image/${format}`,
      'Content-Disposition': `inline; filename="${row.id}.${format}"`,
      'Cache-Control': 'private, no-store',
    })
    .send(buffer);
}
export function posterFiles(ctx) {
  const router = Router();
  router.get('/:id/:format', async (req, res) => {
    const token =
      typeof req.query.token === 'string' && req.query.token.length < 2000 ? req.query.token : '';
    const capability = verifyDownload(ctx, token, req.params.id, req.params.format);
    const row = ctx.db
      .prepare(
        "SELECT * FROM poster_jobs WHERE id=? AND user_id=? AND status='completed' AND expires_at>?",
      )
      .get(req.params.id, capability.userId, ctx.now());
    if (!row) throw new HttpError(410, 'Poster output has expired or was deleted');
    await sendOutput(ctx, row, req.params.format, res);
  });
  return router;
}
