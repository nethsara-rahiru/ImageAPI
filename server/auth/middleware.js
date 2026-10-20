import { COOKIE } from './credentials.js';
import { equal, hash } from '../security/tokens.js';
import { HttpError } from '../lib/errors.js';
export function sessionAuth(ctx) {
  return (req, res, next) => {
    const cookie = req.cookies?.[COOKIE];
    const secret = typeof cookie === 'string' && cookie.length <= 200 ? cookie : '';
    const session = ctx.db
      .prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?')
      .get(hash(secret), ctx.now());
    if (!session) return next(new HttpError(401, 'Please sign in to continue'));
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      !equal(req.get('X-CSRF-Token'), session.csrf)
    )
      return next(new HttpError(403, 'Session check failed. Refresh the page and try again'));
    req.auth = { userId: session.user_id, keyId: null, csrf: session.csrf };
    next();
  };
}
export function imageAuth(ctx) {
  const session = sessionAuth(ctx);
  return (req, res, next) => {
    const authorization = req.get('Authorization');
    if (!authorization) return session(req, res, next);
    const match = /^Bearer (ia_live_[A-Za-z0-9_-]{43})$/i.exec(authorization);
    const invalid = () =>
      next(new HttpError(401, 'Invalid or revoked ImageAPI key', { 'WWW-Authenticate': 'Bearer' }));
    if (!match) return invalid();
    const key = ctx.db
      .prepare('SELECT id,user_id FROM api_keys WHERE token_hash=? AND revoked_at IS NULL')
      .get(hash(match[1]));
    if (!key) return invalid();
    ctx.db.prepare('UPDATE api_keys SET last_used_at=? WHERE id=?').run(ctx.now(), key.id);
    req.auth = { userId: key.user_id, keyId: key.id, csrf: null };
    next();
  };
}
