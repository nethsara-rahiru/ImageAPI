import { transaction } from '../db/index.js';
import { HttpError } from '../lib/errors.js';
import { id } from '../security/tokens.js';
export const monthStart = (now) => {
  const date = new Date(now * 1000);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000;
};
export function expirePending(ctx) {
  ctx.db
    .prepare(
      "UPDATE usage SET status='unknown',error_code='interrupted' WHERE status='pending' AND created_at<?",
    )
    .run(ctx.now() - 300);
}
export function reserve(ctx, user, body) {
  expirePending(ctx);
  return transaction(ctx.db, () => {
    const active = ctx.db
      .prepare("SELECT COUNT(*) AS count FROM usage WHERE user_id=? AND status='pending'")
      .get(user.userId).count;
    if (active >= ctx.config.concurrency)
      throw new HttpError(429, 'Two generations are already running. Wait for one to finish', {
        'Retry-After': '10',
      });
    const used = ctx.db
      .prepare(
        "SELECT COUNT(*) AS count FROM usage WHERE user_id=? AND created_at>=? AND status IN ('success','pending','unknown')",
      )
      .get(user.userId, monthStart(ctx.now())).count;
    if (used >= ctx.config.freeLimit)
      throw new HttpError(
        429,
        'Monthly image limit reached. It resets on the first day of next month (UTC)',
      );
    const requestId = 'req_' + id();
    ctx.db
      .prepare(
        'INSERT INTO usage(id,user_id,api_key_id,provider,model,size,source,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(
        requestId,
        user.userId,
        user.keyId,
        body.provider,
        body.model,
        body.size,
        user.keyId ? 'api' : 'playground',
        'pending',
        ctx.now(),
      );
    return requestId;
  });
}
export function finish(ctx, requestId, status, duration, error = null) {
  ctx.db
    .prepare('UPDATE usage SET status=?,duration_ms=?,error_code=? WHERE id=?')
    .run(status, Math.round(duration), error, requestId);
}
