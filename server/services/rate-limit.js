import { transaction } from '../db/index.js';
import { HttpError } from '../lib/errors.js';
export function rateLimit(ctx, bucket, limit, window) {
  const now = ctx.now();
  transaction(ctx.db, () => {
    ctx.db.prepare('DELETE FROM rate_limits WHERE resets_at<=?').run(now);
    const row = ctx.db
      .prepare('SELECT count,resets_at FROM rate_limits WHERE bucket=?')
      .get(bucket);
    if (row && row.count >= limit)
      throw new HttpError(429, 'Too many requests. Try again shortly', {
        'Retry-After': String(row.resets_at - now),
      });
    ctx.db
      .prepare(
        'INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1',
      )
      .run(bucket, now + window);
  });
}
