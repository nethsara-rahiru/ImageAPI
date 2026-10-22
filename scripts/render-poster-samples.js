import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { posterSchema } from '../server/posters/schema.js';
import { composePoster } from '../server/posters/composer.js';
const args = process.argv.slice(2),
  value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const out = path.resolve(value('--out', './poster-samples'));
const source = value('--background', null);
const buffer = source
  ? await readFile(source)
  : await sharp(await readFile(new URL('../frontend/assets/botanical.svg', import.meta.url)))
      .resize(1200, 1200, { fit: 'cover' })
      .png()
      .toBuffer();
const meta = await sharp(buffer).metadata();
const background = { encoded: buffer.toString('base64'), width: meta.width, height: meta.height };
await mkdir(out, { recursive: true });
for (const layout of ['editorial', 'minimal', 'bold', 'event', 'sale']) {
  const body = posterSchema.parse({
    prompt: 'A refined floating botanical greenhouse exhibition',
    headline: layout === 'sale' ? 'ROOM TO GROW.' : 'BOTANICAL FUTURES',
    subtitle: 'An exhibition of nature, architecture, and possibility.',
    details: ['16 NOVEMBER · 10 AM–6 PM', 'THE GLASSHOUSE GALLERY'],
    cta: layout === 'sale' ? 'EXPLORE THE COLLECTION' : 'DISCOVER THE EXHIBITION',
    eyebrow: 'A NEW PERSPECTIVE',
    layout,
    size: layout === 'sale' ? 'landscape' : 'portrait',
  });
  const poster = await composePoster(background, body, null);
  await writeFile(path.join(out, `${layout}.png`), poster.buffer);
  await writeFile(path.join(out, `${layout}.json`), JSON.stringify(poster.design, null, 2));
  console.log(`${layout}: ${poster.design.width} × ${poster.design.height}; checks passed`);
}
const thumbs = await Promise.all(
  ['editorial', 'minimal', 'bold', 'event', 'sale'].map(async (layout, i) => ({
    input: await sharp(path.join(out, `${layout}.png`))
      .resize(360, 450, { fit: 'contain', background: '#dce5e9' })
      .png()
      .toBuffer(),
    left: i * 380 + 20,
    top: 20,
  })),
);
await sharp({ create: { width: 1920, height: 490, channels: 3, background: '#dce5e9' } })
  .composite(thumbs)
  .png()
  .toFile(path.join(out, 'contact-sheet.png'));
