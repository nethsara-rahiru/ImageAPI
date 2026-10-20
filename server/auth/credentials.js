import { hash, token, id } from '../security/tokens.js';
export const COOKIE = 'imageapi_session';
export function issueKey(ctx, userId, name) {
  const secret = 'ia_live_' + token();
  const keyId = id();
  ctx.db
    .prepare(
      'INSERT INTO api_keys(id,user_id,name,token_hash,prefix,created_at) VALUES (?,?,?,?,?,?)',
    )
    .run(
      keyId,
      userId,
      name,
      hash(secret),
      secret.slice(0, 15) + '…' + secret.slice(-4),
      ctx.now(),
    );
  return { id: keyId, api_key: secret, name };
}
export function issueSession(ctx, userId) {
  const session = token(),
    csrf = token();
  ctx.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(ctx.now());
  ctx.db
    .prepare('INSERT INTO sessions VALUES (?,?,?,?)')
    .run(hash(session), userId, csrf, ctx.now() + ctx.config.sessionDays * 86400);
  return { session, csrf };
}
export function setSession(ctx, res, secret) {
  res.cookie(COOKIE, secret, {
    maxAge: ctx.config.sessionDays * 86400 * 1000,
    httpOnly: true,
    secure: ctx.config.secureCookies,
    sameSite: 'lax',
    path: '/',
  });
}
export function clearSession(ctx, res) {
  res.clearCookie(COOKIE, {
    httpOnly: true,
    secure: ctx.config.secureCookies,
    sameSite: 'lax',
    path: '/',
  });
}
export function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    plan: row.plan,
    created_at: row.created_at,
  };
}
