import { expirePending, monthStart } from './usage.js';
export function dashboard(ctx, userId, { page, status }) {
  expirePending(ctx);
  const start = monthStart(ctx.now());
  const counts = Object.fromEntries(
    ctx.db
      .prepare(
        'SELECT status,COUNT(*) AS count FROM usage WHERE user_id=? AND created_at>=? GROUP BY status',
      )
      .all(userId, start)
      .map((row) => [row.status, row.count]),
  );
  const average = ctx.db
    .prepare(
      "SELECT AVG(duration_ms) AS value FROM usage WHERE user_id=? AND created_at>=? AND status='success'",
    )
    .get(userId, start).value;
  const providerCounts = ctx.db
    .prepare(
      "SELECT provider,COUNT(*) AS count FROM usage WHERE user_id=? AND created_at>=? AND status='success' GROUP BY provider",
    )
    .all(userId, start);
  const activeKeys = ctx.db
    .prepare('SELECT COUNT(*) AS count FROM api_keys WHERE user_id=? AND revoked_at IS NULL')
    .get(userId).count;
  const connected = ctx.db
    .prepare('SELECT COUNT(*) AS count FROM provider_keys WHERE user_id=?')
    .get(userId).count;
  const today = new Date(ctx.now() * 1000);
  today.setUTCHours(0, 0, 0, 0);
  const since = today.getTime() / 1000 - 29 * 86400;
  const dailyRows = ctx.db
    .prepare(
      "SELECT date(created_at,'unixepoch') AS day,COUNT(*) AS count FROM usage WHERE user_id=? AND created_at>=? AND status='success' GROUP BY day",
    )
    .all(userId, since);
  const dailyMap = new Map(dailyRows.map((row) => [row.day, row.count]));
  const daily = Array.from({ length: 30 }, (_, i) => {
    const day = new Date((since + i * 86400) * 1000).toISOString().slice(0, 10);
    return { day, count: dailyMap.get(day) || 0 };
  });
  let where = 'u.user_id=?';
  const parameters = [userId];
  if (status !== 'all') {
    where += ' AND u.status=?';
    parameters.push(status);
  }
  const total = ctx.db
    .prepare('SELECT COUNT(*) AS count FROM usage u WHERE ' + where)
    .get(...parameters).count;
  const requests = ctx.db
    .prepare(
      'SELECT u.*,k.name AS key_name FROM usage u LEFT JOIN api_keys k ON u.api_key_id=k.id WHERE ' +
        where +
        ' ORDER BY u.created_at DESC,u.id DESC LIMIT 10 OFFSET ?',
    )
    .all(...parameters, (page - 1) * 10);
  const success = counts.success || 0,
    used = success + (counts.pending || 0) + (counts.unknown || 0),
    attempts = Object.values(counts).reduce((a, b) => a + b, 0);
  const date = new Date(ctx.now() * 1000);
  const reset = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 1000;
  return {
    summary: {
      images: success,
      used,
      limit: ctx.config.freeLimit,
      requests: attempts,
      failed: counts.failed || 0,
      success_rate: attempts ? Math.round((success / attempts) * 1000) / 10 : null,
      average_ms: average === null ? null : Math.round(average),
      active_keys: activeKeys,
      connected_providers: connected,
      reset_at: reset,
    },
    daily,
    providers: providerCounts,
    requests,
    pagination: { page, total, pages: Math.max(1, Math.ceil(total / 10)) },
  };
}
