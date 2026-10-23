import sharp from 'sharp';
export async function productScene(encoded, plan) {
  const { width: w, height: h, geometry: g } = plan,
    raw = Buffer.from(encoded, 'base64');
  const base = await sharp(raw)
    .resize(w, h, { fit: 'cover', position: 'centre' })
    .blur(28)
    .modulate({ brightness: 0.48, saturation: 0.8 })
    .png()
    .toBuffer();
  const { width, height } = g.hero;
  const mask = (vertical) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="fade" x1="0" y1="0" x2="${vertical ? '0' : '1'}" y2="${vertical ? '1' : '0'}"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset=".10" stop-color="white"/><stop offset=".90" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#fade)"/></svg>`,
    );
  const hero = await sharp(raw)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .ensureAlpha()
    .composite([
      { input: mask(false), blend: 'dest-in' },
      { input: mask(true), blend: 'dest-in' },
    ])
    .png()
    .toBuffer();
  return { base, hero: { input: hero, left: g.hero.x, top: g.hero.y } };
}
