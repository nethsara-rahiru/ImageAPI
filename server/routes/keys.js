import { Router } from 'express';
import { parse, z } from '../lib/validation.js';
import { HttpError } from '../lib/errors.js';
import { transaction } from '../db/index.js';
import { sessionAuth } from '../auth/middleware.js';
import { issueKey } from '../auth/credentials.js';
import { providerCatalog, providers } from '../providers/catalog.js';
export function keys(ctx) {
  const router = Router();
  router.use(['/keys', '/providers'], sessionAuth(ctx));
  router.get('/keys', (req, res) =>
    res.json({
      keys: ctx.db
        .prepare(
          'SELECT id,name,prefix,created_at,last_used_at,revoked_at FROM api_keys WHERE user_id=? ORDER BY created_at DESC,id DESC',
        )
        .all(req.auth.userId),
      limit: ctx.config.maxApiKeys,
    }),
  );
  router.post('/keys', (req, res) => {
    const body = parse(z.object({ name: z.string().trim().min(1).max(60) }), req.body);
    const key = transaction(ctx.db, () => {
      const { count } = ctx.db
        .prepare('SELECT COUNT(*) AS count FROM api_keys WHERE user_id=? AND revoked_at IS NULL')
        .get(req.auth.userId);
      if (count >= ctx.config.maxApiKeys)
        throw new HttpError(409, 'Maximum active keys reached. Revoke a key first');
      return issueKey(ctx, req.auth.userId, body.name);
    });
    res.status(201).json(key);
  });
  router.delete('/keys/:id', (req, res) => {
    const result = ctx.db
      .prepare('UPDATE api_keys SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL')
      .run(ctx.now(), req.params.id, req.auth.userId);
    if (!result.changes) throw new HttpError(404, 'Active key not found');
    res.sendStatus(204);
  });
  router.get('/providers', (req, res) => {
    const rows = new Map(
      ctx.db
        .prepare('SELECT provider,hint,updated_at FROM provider_keys WHERE user_id=?')
        .all(req.auth.userId)
        .map((row) => [row.provider, row]),
    );
    res.json({
      providers: providerCatalog().map((provider) => ({
        ...provider,
        connected: rows.has(provider.id),
        hint: rows.get(provider.id)?.hint ?? null,
        updated_at: rows.get(provider.id)?.updated_at ?? null,
      })),
    });
  });
  router.put('/providers/:provider', (req, res) => {
    const provider = req.params.provider;
    if (!Object.hasOwn(providers, provider)) throw new HttpError(404, 'Unknown provider');
    const body = parse(
      z.object({
        api_key: z
          .string()
          .min(8)
          .max(512)
          .regex(/^[\x21-\x7E]+$/, 'API key must be ASCII without whitespace'),
      }),
      req.body,
    );
    const encrypted = ctx.encryption.encrypt(body.api_key),
      hint = '••••' + body.api_key.slice(-4);
    ctx.db
      .prepare(
        'INSERT INTO provider_keys VALUES (?,?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET encrypted_key=excluded.encrypted_key,hint=excluded.hint,updated_at=excluded.updated_at',
      )
      .run(req.auth.userId, provider, encrypted, hint, ctx.now());
    res.json({
      connected: true,
      hint,
      message: 'Key saved. It will be verified on your first generation request.',
    });
  });
  router.delete('/providers/:provider', (req, res) => {
    ctx.db
      .prepare('DELETE FROM provider_keys WHERE user_id=? AND provider=?')
      .run(req.auth.userId, req.params.provider);
    res.sendStatus(204);
  });
  return router;
}
