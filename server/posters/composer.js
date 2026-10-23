import sharp from 'sharp';
import { measure, validateCharacters } from './fonts.js';
import { typeset, fitBlock, contrast } from './typography.js';
import { planPoster } from './planner.js';
import { artworkAccent } from './palette.js';
import { logoOverlay } from './branding.js';
import { productTypeset } from './product-type.js';
import { composeProduct } from './product-composer.js';
import { HttpError } from '../lib/errors.js';
const rect = (x, y, width, height, fill, rx = 0) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}"/>`;
export function preflightPoster(body, brand) {
  const plan = planPoster(body, brand);
  validateCharacters(
    [
      body.headline,
      body.subtitle,
      ...body.details,
      body.cta,
      body.eyebrow,
      ...(body.features || []),
      body.offer?.label || '',
      body.offer?.value || '',
      body.offer?.caption || '',
      brand?.name || '',
      brand?.tagline || '',
    ],
    plan.family,
  );
  return {
    plan,
    blocks:
      plan.layout === 'product' ? productTypeset(body, plan, brand).blocks : typeset(body, plan),
  };
}
export async function composePoster(image, body, brand) {
  const autoAccent = !body.accent_color && !brand?.accent_color;
  const selected = autoAccent
    ? {
        ...body,
        accent_color: await artworkAccent(
          image.encoded,
          ['bold', 'event', 'product'].includes(planPoster(body, brand).layout),
        ),
      }
    : body;
  if (planPoster(body, brand).layout === 'product' && autoAccent) {
    const rgb = selected.accent_color
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16));
    if (Math.max(...rgb) - Math.min(...rgb) < 25) selected.accent_color = '#28e7f2';
  }
  const { plan, blocks } = preflightPoster(selected, brand);
  if (plan.layout === 'product') return composeProduct(image, selected, brand, plan, autoAccent);
  const { width: w, height: h, art, margin: m, accent, foreground, background } = plan;
  const u = Math.min(w, h) / 1080;
  const svg = [];
  // Solid text surfaces guarantee contrast regardless of generated artwork.
  svg.push(rect(0, 0, w, h, background));
  const base = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${svg.join('')}</svg>`,
  );
  const artBuffer = await sharp(Buffer.from(image.encoded, 'base64'))
    .resize(art.width, art.height, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  const overlays = [{ input: artBuffer, left: art.x, top: art.y }];
  const vector = [];
  if (plan.layout === 'editorial') {
    vector.push(rect(m, plan.zone.y - 16 * u, 72 * u, 5 * u, accent));
  } else if (plan.layout === 'minimal') {
    vector.push(rect(art.x, art.y, art.width, Math.max(12, 24 * u), background));
    vector.push(rect(art.x, art.y + art.height - 16 * u, art.width, 16 * u, background));
  } else if (plan.layout === 'sale') {
    vector.push(rect(0, 0, 18 * u, h, accent));
    vector.push(
      `<circle cx="${w - m}" cy="${plan.landscape ? m : art.height}" r="${32 * u}" fill="${accent}"/>`,
    );
  } else {
    vector.push(rect(0, art.height - 7 * u, w, 7 * u, accent));
    if (plan.landscape) vector.push(rect(art.x - 7 * u, 0, 7 * u, h, accent));
  }
  for (const block of blocks) {
    if (block.key === 'cta') {
      vector.push(
        rect(
          block.box.x - 22 * u,
          block.box.y - 10 * u,
          Math.min(
            plan.zone.width,
            Math.max(...block.lines.map((line) => measure(line, block.size, block.family))) +
              44 * u,
          ),
          block.height + 20 * u,
          accent,
          6 * u,
        ),
      );
    }
    vector.push(block.svg);
  }
  const label = body.eyebrow || brand?.name || '';
  if (label) {
    const labelWidth = plan.landscape ? plan.zone.width : Math.min(w - 2 * m, 700 * u);
    const fitted = fitBlock(
      label,
      { x: m + 18 * u, y: m + 12 * u, width: labelWidth - 36 * u, height: 70 * u },
      { family: 'sans', maxSize: 19 * u, minSize: 14 * u, fill: '#15212d', maxLines: 2 },
    );
    const pillWidth = Math.min(
      labelWidth,
      Math.max(...fitted.lines.map((line) => measure(line, fitted.size, 'sans'))) + 36 * u,
    );
    vector.push(rect(m, m, pillWidth, fitted.height + 24 * u, '#ffffff', 5 * u), fitted.svg);
  }
  if (brand?.tagline) {
    const footer = fitBlock(
      brand.tagline,
      { x: m, y: h - m, width: w - 2 * m, height: m * 0.7 },
      { family: 'sans', maxSize: 18 * u, minSize: 14 * u, fill: foreground, maxLines: 2 },
    );
    vector.push(footer.svg);
  }
  const cta = blocks.find((block) => block.key === 'cta');
  const checks = {
    all_text_preserved: blocks.every(
      (block) => block.text.replace(/\s/g, '') === block.lines.join('').replace(/\s/g, ''),
    ),
    no_text_overflow: blocks.every(
      (block) =>
        block.box.x >= 0 &&
        block.box.y >= 0 &&
        block.box.x + block.box.width <= w &&
        block.box.y + block.height <= h - m * 0.4,
    ),
    no_text_overlap: blocks.every((block, index) =>
      blocks.every(
        (other, j) =>
          index === j ||
          block.box.y + block.height <= other.box.y + 0.1 ||
          other.box.y + other.height <= block.box.y + 0.1,
      ),
    ),
    readable_font_sizes: blocks.every(
      (block) => block.size >= Math.floor((block.key === 'headline' ? 38 : 20) * u),
    ),
    text_contrast: Number(contrast(foreground, background).toFixed(2)),
    cta_contrast: cta ? Number(contrast(cta.fill, accent).toFixed(2)) : null,
    canvas: { width: w, height: h },
  };
  if (
    !checks.all_text_preserved ||
    !checks.no_text_overflow ||
    !checks.no_text_overlap ||
    !checks.readable_font_sizes ||
    checks.text_contrast < 4.5 ||
    (checks.cta_contrast && checks.cta_contrast < 4.5)
  )
    throw new HttpError(
      422,
      'Poster failed its readability checks. Try a taller canvas or shorter copy.',
    );
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${vector.join('')}</svg>`,
  );
  overlays.push({ input: overlay, left: 0, top: 0 });
  const logo = await logoOverlay(brand, w, m, u);
  if (logo) overlays.push(logo);
  const rendered = await sharp(base).composite(overlays).png().toBuffer();
  const warnings = [];
  if (image.width < art.width || image.height < art.height)
    warnings.push(
      'Background artwork was enlarged for this canvas; text and layout are rendered at full output resolution.',
    );
  return {
    buffer: rendered,
    design: {
      layout: plan.layout,
      font: plan.family,
      accent_color: accent,
      background_color: background,
      palette_source: autoAccent ? 'artwork' : 'brand_or_request',
      width: w,
      height: h,
      text: blocks.map(({ key, text, size, lines, box, height }) => ({
        field: key,
        text,
        font_size: size,
        lines,
        box: { ...box, height },
      })),
      quality: {
        passed: true,
        checks,
        warnings,
        scope:
          'Deterministic typography, bounds, and contrast checks. Artwork semantics and visual brand accuracy are not automatically verified.',
      },
    },
  };
}
