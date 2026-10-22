import { mkdir, writeFile, readFile, rm, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { HttpError } from '../lib/errors.js';
export const outputDir = (ctx) => path.join(ctx.config.dataDir, 'posters');
const validId = /^poster_[a-f0-9]{24}$/;
export function outputPath(ctx, id, format) {
  if (!validId.test(id) || !['png', 'jpeg', 'webp'].includes(format))
    throw new HttpError(404, 'Output not found');
  return path.join(outputDir(ctx), `${id}.${format}`);
}
export async function storeOutput(ctx, id, buffer) {
  const previous = ctx.outputWrite || Promise.resolve();
  const operation = previous.catch(() => {}).then(() => writeOutputs(ctx, id, buffer));
  ctx.outputWrite = operation;
  return operation;
}
async function writeOutputs(ctx, id, buffer) {
  await mkdir(outputDir(ctx), { recursive: true, mode: 0o700 });
  const formats = {
    png: buffer,
    jpeg: await sharp(buffer)
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
      .toBuffer(),
    webp: await sharp(buffer).webp({ quality: 94 }).toBuffer(),
  };
  const bytes = Object.values(formats).reduce((sum, b) => sum + b.length, 0);
  let used = 0;
  for (const file of await readdir(outputDir(ctx))) {
    try {
      used += (await stat(path.join(outputDir(ctx), file))).size;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (used + bytes > ctx.config.posterStorageLimit)
    throw new HttpError(
      507,
      'Poster storage is full. Delete completed posters or increase IMAGEAPI_POSTER_STORAGE_MB.',
    );
  try {
    for (const [format, data] of Object.entries(formats))
      await writeFile(outputPath(ctx, id, format), data, { mode: 0o600, flag: 'wx' });
  } catch (error) {
    await removeOutput(ctx, id);
    throw error;
  }
  return Object.fromEntries(
    Object.entries(formats).map(([format, data]) => [
      format,
      { bytes: data.length, mime_type: `image/${format}` },
    ]),
  );
}
export const readOutput = (ctx, id, format) => readFile(outputPath(ctx, id, format));
export async function removeOutput(ctx, id) {
  await Promise.all(
    ['png', 'jpeg', 'webp'].map((format) => rm(outputPath(ctx, id, format), { force: true })),
  );
}
export function downloadToken(ctx, job, format) {
  const expires = Math.min(job.expires_at, ctx.now() + 900);
  return {
    expires,
    url: `${ctx.config.publicOrigin}/v1/poster-files/${job.id}/${format}?token=${encodeURIComponent(ctx.encryption.encrypt(JSON.stringify({ scope: 'poster-output', id: job.id, userId: job.user_id, format, expires })))}`,
  };
}
export function verifyDownload(ctx, value, id, format) {
  try {
    const data = JSON.parse(ctx.encryption.decrypt(value));
    if (
      data.scope === 'poster-output' &&
      data.id === id &&
      data.format === format &&
      data.expires > ctx.now()
    )
      return data;
  } catch {
    /* Invalid capability. */
  }
  throw new HttpError(
    401,
    'Download link is invalid or expired. Request a fresh link using your ImageAPI key.',
  );
}
export async function cleanupOutputs(ctx) {
  const rows = ctx.db
    .prepare(
      "SELECT id,status FROM poster_jobs WHERE expires_at<=? AND status NOT IN ('expired','deleted','running','queued')",
    )
    .all(ctx.now());
  for (const row of rows) {
    await removeOutput(ctx, row.id);
    ctx.db
      .prepare(
        "UPDATE poster_jobs SET status='expired',stage='expired',encrypted_input=NULL,result_json=NULL,error_json=NULL,webhook_state=CASE WHEN webhook_state='pending' THEN 'expired' ELSE webhook_state END WHERE id=?",
      )
      .run(row.id);
  }
  // Account deletion cascades rows; remove its orphaned files without retaining user images.
  await mkdir(outputDir(ctx), { recursive: true, mode: 0o700 });
  for (const name of await readdir(outputDir(ctx))) {
    const match = /^(poster_[a-f0-9]{24})\.(png|jpeg|webp)$/.exec(name);
    if (match && !ctx.db.prepare('SELECT id FROM poster_jobs WHERE id=?').get(match[1]))
      await rm(path.join(outputDir(ctx), name), { force: true });
  }
}
