import path from 'node:path';

function integer(value, fallback, name, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return parsed;
}

export function loadConfig(overrides = {}) {
  const port = integer(overrides.port ?? process.env.PORT, 8080, 'PORT', 1, 65535);
  const host = overrides.host ?? process.env.HOST ?? '127.0.0.1';
  const publicOrigin =
    overrides.publicOrigin ?? process.env.IMAGEAPI_PUBLIC_ORIGIN ?? `http://127.0.0.1:${port}`;
  const url = new URL(publicOrigin);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.origin !== publicOrigin ||
    url.username ||
    url.password
  )
    throw new Error(
      'IMAGEAPI_PUBLIC_ORIGIN must be an HTTP(S) origin without a path or trailing slash',
    );
  const secureCookies = overrides.secureCookies ?? process.env.IMAGEAPI_SECURE_COOKIES === 'true';
  if (secureCookies && url.protocol !== 'https:')
    throw new Error('Secure cookies require an HTTPS public origin');
  return Object.freeze({
    host,
    port,
    publicOrigin,
    secureCookies,
    dataDir: path.resolve(overrides.dataDir ?? process.env.IMAGEAPI_DATA_DIR ?? './data'),
    encryptionKey: overrides.encryptionKey ?? process.env.IMAGEAPI_ENCRYPTION_KEY,
    freeLimit: overrides.freeLimit ?? 100,
    maxApiKeys: overrides.maxApiKeys ?? 10,
    concurrency: overrides.concurrency ?? 2,
    sessionDays: 7,
    posterWorkers: integer(
      overrides.posterWorkers ?? process.env.IMAGEAPI_POSTER_WORKERS,
      2,
      'IMAGEAPI_POSTER_WORKERS',
      1,
      4,
    ),
    posterQueueLimit: 20,
    posterStorageLimit:
      integer(
        overrides.posterStorageLimit ?? process.env.IMAGEAPI_POSTER_STORAGE_MB,
        512,
        'IMAGEAPI_POSTER_STORAGE_MB',
        32,
        10240,
      ) *
      1024 *
      1024,
    jobInterval: overrides.jobInterval ?? 1000,
    jsonLimit: 1024 * 1024,
    uploadLimit: overrides.uploadLimit ?? 10 * 1024 * 1024,
    maxPixels: overrides.maxPixels ?? 20_000_000,
    providerTimeout: overrides.providerTimeout ?? 180_000,
    providerResponseLimit: 30 * 1024 * 1024,
  });
}
