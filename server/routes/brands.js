import { Router } from 'express';
import { imageAuth } from '../auth/middleware.js';
import { parse } from '../lib/validation.js';
import { brandSchema } from '../posters/schema.js';
import { normalizeLogo } from '../posters/logo.js';
import { readBrand } from '../posters/brands.js';
import { id } from '../security/tokens.js';
import { HttpError } from '../lib/errors.js';
export function brands(ctx) {
  const router = Router();
  router.use(imageAuth(ctx));
  router.get('/', (req, res) => {
    const rows = ctx.db
      .prepare('SELECT id FROM brands WHERE user_id=? ORDER BY created_at DESC,id')
      .all(req.auth.userId);
    res.json({ brands: rows.map((row) => readBrand(ctx, req.auth.userId, row.id)) });
  });
  router.post('/', async (req, res) => {
    const body = parse(brandSchema, req.body);
    if (
      ctx.db.prepare('SELECT COUNT(*) AS n FROM brands WHERE user_id=?').get(req.auth.userId).n >=
      10
    )
      throw new HttpError(409, 'You can save up to ten brand profiles');
    body.logo = await normalizeLogo(body.logo, ctx.config);
    const brandId = 'brand_' + id();
    ctx.db
      .prepare('INSERT INTO brands VALUES (?,?,?,?)')
      .run(brandId, req.auth.userId, ctx.encryption.encrypt(JSON.stringify(body)), ctx.now());
    res.status(201).json(readBrand(ctx, req.auth.userId, brandId));
  });
  router.put('/:id', async (req, res) => {
    readBrand(ctx, req.auth.userId, req.params.id);
    const body = parse(brandSchema, req.body);
    body.logo = await normalizeLogo(body.logo, ctx.config);
    ctx.db
      .prepare('UPDATE brands SET encrypted_profile=? WHERE id=? AND user_id=?')
      .run(ctx.encryption.encrypt(JSON.stringify(body)), req.params.id, req.auth.userId);
    res.json(readBrand(ctx, req.auth.userId, req.params.id));
  });
  router.delete('/:id', (req, res) => {
    const result = ctx.db
      .prepare('DELETE FROM brands WHERE id=? AND user_id=?')
      .run(req.params.id, req.auth.userId);
    if (!result.changes) throw new HttpError(404, 'Brand profile not found');
    res.sendStatus(204);
  });
  return router;
}
