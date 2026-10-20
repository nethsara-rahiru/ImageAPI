import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config/index.js';
import { openDatabase } from './db/index.js';
import { loadEncryption } from './security/encryption.js';
import { security } from './middleware/security.js';
import { errorHandler, HttpError } from './lib/errors.js';
import { createTransport } from './providers/transport.js';
import { createGenerator } from './providers/index.js';
import { accounts } from './routes/accounts.js';
import { keys } from './routes/keys.js';
import { images } from './routes/images.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { publicRoutes } from './routes/public.js';
const frontend = fileURLToPath(new URL('../frontend/', import.meta.url));
const pages = new Set([
  '/',
  '/pricing',
  '/login',
  '/signup',
  '/recover',
  '/dashboard',
  '/api',
  '/playground',
  '/settings',
  '/docs',
]);

export function createApp({
  config: overrides = {},
  now = () => Math.floor(Date.now() / 1000),
  generateImage,
  fetchImpl,
} = {}) {
  const config = loadConfig(overrides),
    db = openDatabase(config);
  let encryption, transport;
  try {
    encryption = loadEncryption(config);
    transport = createTransport(config, fetchImpl);
  } catch (error) {
    db.close();
    throw error;
  }
  const ctx = {
    config,
    db,
    encryption,
    now,
    generateImage: generateImage || createGenerator(transport, config),
  };
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(security(config));
  app.use((req, res, next) => {
    const limit = req.path === '/v1/images/transform' ? 11 * 1024 * 1024 : config.jsonLimit;
    const length = req.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > limit))
      return next(new HttpError(413, 'Request body is too large'));
    next();
  });
  app.use(express.json({ limit: config.jsonLimit, strict: true }));
  app.use(cookieParser());
  app.use(publicRoutes());
  app.use('/api/auth', accounts(ctx));
  app.use('/api', dashboardRoutes(ctx));
  app.use('/api', keys(ctx));
  app.use('/v1/images', images(ctx));
  app.use(
    '/static',
    express.static(frontend, {
      dotfiles: 'deny',
      index: false,
      fallthrough: false,
      redirect: false,
      maxAge: 0,
    }),
  );
  app.use((req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method) && pages.has(req.path)) {
      res.set('Cache-Control', 'no-cache');
      return res.sendFile(path.join(frontend, 'index.html'));
    }
    next(new HttpError(404, 'Page not found'));
  });
  app.use(errorHandler);
  let closed = false;
  return {
    app,
    context: ctx,
    async close() {
      if (closed) return;
      closed = true;
      await transport.close();
      db.close();
    },
  };
}
