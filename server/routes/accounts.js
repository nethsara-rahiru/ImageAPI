import { Router } from 'express';
import { parse, z, email, password, newPassword, name } from '../lib/validation.js';
import { HttpError } from '../lib/errors.js';
import { transaction } from '../db/index.js';
import { hashPassword, verifyPassword } from '../security/passwords.js';
import { hash, id, token } from '../security/tokens.js';
import { rateLimit } from '../services/rate-limit.js';
import { sessionAuth } from '../auth/middleware.js';
import {
  COOKIE,
  issueKey,
  issueSession,
  setSession,
  clearSession,
  publicUser,
} from '../auth/credentials.js';
const credentials = z.object({ email, password });

export function accounts(ctx) {
  const router = Router();
  const auth = sessionAuth(ctx);
  function throttle(req, address) {
    rateLimit(ctx, 'auth-ip:' + hash(req.socket.remoteAddress || 'unknown'), 30, 900);
    rateLimit(ctx, 'auth-account:' + hash(address), 15, 900);
  }
  router.post('/register', async (req, res) => {
    const body = parse(credentials.extend({ name, password: newPassword }), req.body);
    throttle(req, body.email);
    const userId = id(),
      recovery = 'iar_' + token(),
      encoded = await hashPassword(body.password);
    let result;
    try {
      result = transaction(ctx.db, () => {
        ctx.db
          .prepare(
            'INSERT INTO users(id,email,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)',
          )
          .run(userId, body.email, body.name, encoded, hash(recovery), ctx.now());
        const key = issueKey(ctx, userId, 'Default key'),
          session = issueSession(ctx, userId);
        return {
          user: publicUser(ctx.db.prepare('SELECT * FROM users WHERE id=?').get(userId)),
          api_key: key.api_key,
          ...session,
          recovery_code: recovery,
        };
      });
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed: users.email'))
        throw new HttpError(409, 'An account with that email already exists');
      throw error;
    }
    setSession(ctx, res, result.session);
    const { session, ...response } = result;
    res.status(201).json(response);
  });
  router.post('/login', async (req, res) => {
    const body = parse(credentials, req.body);
    throttle(req, body.email);
    const user = ctx.db.prepare('SELECT * FROM users WHERE email=?').get(body.email);
    const valid = await verifyPassword(body.password, user?.password_hash);
    if (!user || !valid) throw new HttpError(401, 'Email or password is incorrect');
    const upgraded = user.password_hash.startsWith('scrypt$')
      ? null
      : await hashPassword(body.password);
    const result = transaction(ctx.db, () => {
      const current = ctx.db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id);
      if (current?.password_hash !== user.password_hash)
        throw new HttpError(401, 'Account credentials changed. Please sign in again');
      if (upgraded)
        ctx.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(upgraded, user.id);
      return issueSession(ctx, user.id);
    });
    setSession(ctx, res, result.session);
    res.json({ user: publicUser(user), csrf: result.csrf });
  });
  router.get('/me', auth, (req, res) => {
    const user = ctx.db.prepare('SELECT * FROM users WHERE id=?').get(req.auth.userId);
    res.json({ user: publicUser(user), csrf: req.auth.csrf });
  });
  router.post('/logout', auth, (req, res) => {
    ctx.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(req.cookies[COOKIE]));
    clearSession(ctx, res);
    res.sendStatus(204);
  });
  router.post('/password', auth, async (req, res) => {
    const body = parse(
      z.object({ current_password: password, new_password: newPassword }),
      req.body,
    );
    rateLimit(ctx, 'password:' + req.auth.userId, 5, 900);
    const user = ctx.db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.auth.userId);
    if (!(await verifyPassword(body.current_password, user.password_hash)))
      throw new HttpError(400, 'Current password is incorrect');
    const encoded = await hashPassword(body.new_password);
    transaction(ctx.db, () => {
      const result = ctx.db
        .prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?')
        .run(encoded, req.auth.userId, user.password_hash);
      if (!result.changes)
        throw new HttpError(401, 'Account credentials changed. Please sign in again');
      ctx.db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.auth.userId);
    });
    clearSession(ctx, res);
    res.sendStatus(204);
  });
  router.post('/recover', async (req, res) => {
    const body = parse(
      credentials.extend({ password: newPassword, recovery_code: z.string().min(20).max(200) }),
      req.body,
    );
    throttle(req, body.email);
    const replacement = 'iar_' + token(),
      encoded = await hashPassword(body.password);
    transaction(ctx.db, () => {
      const user = ctx.db
        .prepare('SELECT id FROM users WHERE email=? AND recovery_hash=?')
        .get(body.email, hash(body.recovery_code));
      if (!user) throw new HttpError(400, 'Email or recovery code is incorrect');
      ctx.db
        .prepare('UPDATE users SET password_hash=?,recovery_hash=? WHERE id=?')
        .run(encoded, hash(replacement), user.id);
      ctx.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      ctx.db
        .prepare('UPDATE api_keys SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL')
        .run(ctx.now(), user.id);
    });
    clearSession(ctx, res);
    res.json({
      recovery_code: replacement,
      message:
        'Password reset. All sessions and ImageAPI keys were revoked. Sign in to create a new API key.',
    });
  });
  router.delete('/account', auth, async (req, res) => {
    const body = parse(z.object({ password }), req.body);
    rateLimit(ctx, 'password:' + req.auth.userId, 5, 900);
    const user = ctx.db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.auth.userId);
    if (!(await verifyPassword(body.password, user.password_hash)))
      throw new HttpError(400, 'Password is incorrect');
    const result = ctx.db
      .prepare('DELETE FROM users WHERE id=? AND password_hash=?')
      .run(req.auth.userId, user.password_hash);
    if (!result.changes)
      throw new HttpError(401, 'Account credentials changed. Please sign in again');
    clearSession(ctx, res);
    res.sendStatus(204);
  });
  return router;
}
