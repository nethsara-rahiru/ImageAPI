import { measure, wrap, outline } from './fonts.js';
import { HttpError } from '../lib/errors.js';
export function contrast(a, b) {
  const luminance = (hex) => {
    const values = hex
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const inkFor = (colour) =>
  contrast('#ffffff', colour) > contrast('#101b29', colour) ? '#ffffff' : '#101b29';
export function fitBlock(
  text,
  box,
  { family = 'sans', maxSize, minSize, fill, lineHeight = 1.18, maxLines = 30 },
) {
  for (let size = Math.floor(maxSize); size >= minSize; size--) {
    const lines = wrap(text, box.width, size, family),
      height = lines.length * size * lineHeight;
    if (
      lines.length <= maxLines &&
      height <= box.height &&
      lines.every((line) => measure(line, size, family) <= box.width + 0.1)
    ) {
      return {
        text,
        lines,
        size,
        height,
        family,
        box,
        fill,
        svg: lines
          .map((line, index) =>
            outline(line, box.x, box.y + size * (0.91 + index * lineHeight), size, family, fill),
          )
          .join(''),
      };
    }
  }
  throw new HttpError(
    422,
    'Poster copy cannot fit legibly in this layout. Shorten the text or choose a taller size. No text was silently removed.',
  );
}
export function typeset(body, plan) {
  const { zone, width: w, foreground, family } = plan,
    unit = Math.min(w, plan.height) / 1080;
  const gap = 22 * unit,
    min = 20 * unit;
  const content = [
    {
      key: 'headline',
      text: body.headline,
      family,
      max: plan.landscape ? 94 * unit : 108 * unit,
      min: 38 * unit,
      weight: 4,
    },
    {
      key: 'subtitle',
      text: body.subtitle,
      family: 'sans',
      max: 32 * unit,
      min: 22 * unit,
      weight: 1.5,
    },
    {
      key: 'details',
      text: body.details.join('\n'),
      family: 'sans',
      max: 25 * unit,
      min,
      weight: Math.max(1, body.details.length) * 0.65,
    },
    { key: 'cta', text: body.cta, family: 'display', max: 25 * unit, min, weight: 0.9 },
  ].filter((item) => item.text);
  const available = zone.height - gap * (content.length - 1),
    total = content.reduce((n, c) => n + c.weight, 0);
  let y = zone.y;
  const blocks = [];
  // Allocate a minimum readable height per field, then redistribute unused space to the headline.
  const minima = content.map((item) =>
    fitBlock(
      item.text,
      { x: zone.x, y: 0, width: zone.width, height: 10000 },
      {
        family: item.family,
        maxSize: Math.ceil(item.min),
        minSize: Math.floor(item.min),
        fill: foreground,
      },
    ),
  );
  const required = minima.reduce((n, b) => n + b.height, 0);
  if (required > available)
    throw new HttpError(
      422,
      'This amount of text cannot fit at a readable size. Choose a taller poster or shorten the copy.',
    );
  const spare = available - required;
  content.forEach((item, index) => {
    const maxHeight = minima[index].height + (spare * item.weight) / total;
    const box = { x: zone.x, y, width: zone.width, height: maxHeight };
    if (item.key === 'cta') {
      box.x += 22 * unit;
      box.width -= 44 * unit;
    }
    const block = fitBlock(item.text, box, {
      family: item.family,
      maxSize: item.max,
      minSize: Math.floor(item.min),
      fill: item.key === 'cta' ? inkFor(plan.accent) : foreground,
    });
    block.key = item.key;
    blocks.push(block);
    y += block.height + gap;
  });
  return blocks;
}
