import sharp from 'sharp';
import { HttpError } from '../lib/errors.js';
function supportedImage(buffer) {
  return (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) ||
    (buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP')
  );
}
export async function normalizeImage(encoded, config) {
  if (
    typeof encoded !== 'string' ||
    encoded.length > 28_000_000 ||
    !encoded.length ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    throw new HttpError(502, 'Provider returned invalid image data');
  try {
    const raw = Buffer.from(encoded, 'base64');
    if (!supportedImage(raw)) throw new Error('Unsupported format');
    const pipeline = sharp(raw, {
      limitInputPixels: config.maxPixels,
      failOn: 'warning',
      pages: 1,
    });
    const metadata = await pipeline.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format)) throw new Error('Unsupported format');
    const result = await pipeline.rotate().png().toBuffer({ resolveWithObject: true });
    if (result.data.length > 20 * 1024 * 1024) throw new Error('Output too large');
    return {
      encoded: result.data.toString('base64'),
      width: result.info.width,
      height: result.info.height,
    };
  } catch {
    throw new HttpError(502, 'Provider returned invalid image data');
  }
}
export async function transformImage(buffer, options, config) {
  if (!buffer?.length) throw new HttpError(400, 'Upload is empty');
  if (!supportedImage(buffer)) throw new HttpError(415, 'Supported input formats: JPEG, PNG, WebP');
  try {
    const metadata = await sharp(buffer, { limitInputPixels: false, pages: 1 }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format))
      throw new HttpError(415, 'Supported input formats: JPEG, PNG, WebP');
    if (metadata.width * metadata.height > config.maxPixels)
      throw new HttpError(413, 'Image must contain at most 20 million pixels');
    let pipeline = sharp(buffer, {
      limitInputPixels: config.maxPixels,
      failOn: 'warning',
      pages: 1,
    })
      .rotate()
      .resize({
        width: options.width,
        height: options.height,
        fit: 'inside',
        withoutEnlargement: true,
      });
    if (options.format === 'jpeg') pipeline = pipeline.flatten({ background: '#ffffff' });
    return await pipeline
      .toFormat(options.format, { quality: options.quality })
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(415, 'Invalid or corrupt image');
  }
}
