import sharp from 'sharp';
export async function logoOverlay(
  brand,
  width,
  margin,
  unit,
  { maxWidth = 200, maxHeight = 80, top = margin } = {},
) {
  if (!brand?.logo) return null;
  const logoWidth = Math.round(maxWidth * unit),
    logoHeight = Math.round(maxHeight * unit);
  const raw = Buffer.from(brand.logo, 'base64');
  const sample = await sharp(raw).resize(64, 64, { fit: 'inside' }).ensureAlpha().raw().toBuffer();
  let light = 0,
    alpha = 0;
  for (let i = 0; i < sample.length; i += 4) {
    const a = sample[i + 3] / 255;
    light += (sample[i] * 0.2126 + sample[i + 1] * 0.7152 + sample[i + 2] * 0.0722) * a;
    alpha += a;
  }
  const panel = alpha && light / alpha > 180 ? '#15212d' : '#ffffff';
  const buffer = await sharp(raw)
    .resize(logoWidth - 24, logoHeight - 24, {
      fit: 'contain',
      background: panel,
      withoutEnlargement: true,
    })
    .flatten({ background: panel })
    .extend({ top: 12, bottom: 12, left: 12, right: 12, background: panel })
    .png()
    .toBuffer();
  return { input: buffer, left: Math.round(width - margin - logoWidth), top: Math.round(top) };
}
