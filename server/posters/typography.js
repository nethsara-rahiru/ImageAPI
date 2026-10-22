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
  const gap = 24 * unit,
    min = 20 * unit;
  const content = [
    {
      key: 'headline',
      text: body.headline,
      family,
      max: plan.landscape ? 110 * unit : 140 * unit,
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
  const minima = content.map((item) =>
    fitBlock(
      item.text,
      { x: zone.x, y: 0, width: zone.width - (item.key === 'cta' ? 44 * unit : 0), height: 10000 },
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
  const blocks = content.map((item, index) => {
    const box = {
      x: zone.x + (item.key === 'cta' ? 22 * unit : 0),
      y: 0,
      width: zone.width - (item.key === 'cta' ? 44 * unit : 0),
      height: minima[index].height + (spare * item.weight) / total,
    };
    const block = fitBlock(item.text, box, {
      family: item.family,
      maxSize: item.max,
      minSize: Math.floor(item.min),
      fill: item.key === 'cta' ? inkFor(plan.accent) : foreground,
    });
    block.key = item.key;
    return block;
  });
  // Give space unused by short supporting copy back to the headline.
  const headline = blocks[0],
    headlineSpec = content[0];
  const expanded = fitBlock(
    headlineSpec.text,
    { ...headline.box, height: available - blocks.slice(1).reduce((sum, b) => sum + b.height, 0) },
    { family, maxSize: headlineSpec.max, minSize: Math.floor(headlineSpec.min), fill: foreground },
  );
  blocks[0] = { ...expanded, key: 'headline' };
  const footer = blocks.filter((b) => ['details', 'cta'].includes(b.key));
  const footerHeight =
    footer.reduce((sum, b) => sum + b.height, 0) + gap * Math.max(0, footer.length - 1);
  let top = zone.y,
    bottom = zone.y + zone.height - footerHeight;
  for (const block of blocks) {
    block.box.y = ['details', 'cta'].includes(block.key) ? bottom : top;
    if (['details', 'cta'].includes(block.key)) bottom += block.height + gap;
    else top += block.height + gap;
    block.svg = block.lines
      .map((line, index) =>
        outline(
          line,
          block.box.x,
          block.box.y + block.size * (0.91 + index * 1.18),
          block.size,
          block.family,
          block.fill,
        ),
      )
      .join('');
  }
  return blocks;
}
