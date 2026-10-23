import sharp from 'sharp';
import { HttpError } from '../lib/errors.js';
import { normalizeImage } from '../services/images.js';
export async function normalizeLogo(value, config) {
  if (!value) return null;
  const encoded = value.replace(/^data:image\/(?:png|jpeg|webp);base64,/, '');
  if (encoded.length > 750000) throw new HttpError(413, 'Logo must be under 550 KB');
  try {
    const image = await normalizeImage(encoded, { ...config, maxPixels: 4_000_000 });
    const buffer = await sharp(Buffer.from(image.encoded, 'base64'))
      .resize({ width: 600, height: 240, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return buffer.toString('base64');
  } catch {
    throw new HttpError(
      422,
      'Use a valid PNG, JPEG, or WebP logo under 550 KB and four million pixels. SVG and remote URLs are not accepted.',
    );
  }
}
