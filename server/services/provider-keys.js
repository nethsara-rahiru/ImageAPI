import { HttpError } from '../lib/errors.js';
export function providerKey(ctx, userId, provider) {
  const row = ctx.db
    .prepare('SELECT encrypted_key FROM provider_keys WHERE user_id=? AND provider=?')
    .get(userId, provider);
  if (!row)
    throw new HttpError(409, 'Add your provider API key in Settings before generating an image');
  let key;
  try {
    key = ctx.encryption.decrypt(row.encrypted_key);
  } catch {
    throw new HttpError(503, 'Provider key could not be decrypted. Reconnect it in Settings');
  }
  if (!row.encrypted_key.startsWith('v2:'))
    ctx.db
      .prepare(
        'UPDATE provider_keys SET encrypted_key=? WHERE user_id=? AND provider=? AND encrypted_key=?',
      )
      .run(ctx.encryption.encrypt(key), userId, provider, row.encrypted_key);
  return key;
}
