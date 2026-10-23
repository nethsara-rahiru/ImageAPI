import sharp from 'sharp';
export async function artworkAccent(encoded, dark = false) {
  const { dominant } = await sharp(Buffer.from(encoded, 'base64'))
    .resize(96, 96, { fit: 'inside' })
    .stats();
  let channels = [dominant.r, dominant.g, dominant.b];
  // Keep a recognisable artwork hue while avoiding muddy CTAs on dark layouts.
  if (dark) channels = channels.map((value) => Math.round(value * 0.68 + 255 * 0.32));
  else channels = channels.map((value) => Math.round(value * 0.78));
  return '#' + channels.map((value) => value.toString(16).padStart(2, '0')).join('');
}
