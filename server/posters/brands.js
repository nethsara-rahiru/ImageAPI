import { HttpError } from '../lib/errors.js';
export function readBrand(ctx, userId, brandId) {
  if (!brandId) return null;
  const row = ctx.db.prepare('SELECT * FROM brands WHERE id=? AND user_id=?').get(brandId, userId);
  if (!row) throw new HttpError(404, 'Brand profile not found');
  return {
    id: row.id,
    ...JSON.parse(ctx.encryption.decrypt(row.encrypted_profile)),
    created_at: row.created_at,
  };
}
