import sharp from 'sharp';
import { outline, measure } from './fonts.js';
import { productTypeset, highlightColour } from './product-type.js';
import { fitBlock, contrast } from './typography.js';
import { productScene } from './product-scene.js';
import { featureIcon } from './product-icons.js';
import { logoOverlay } from './branding.js';
import { HttpError } from '../lib/errors.js';
const overlaps = (a, b) =>
  a.x < b.x + b.width - 0.1 &&
  a.x + a.width > b.x + 0.1 &&
  a.y < b.y + b.height - 0.1 &&
  a.y + a.height > b.y + 0.1;
export async function composeProduct(image, body, brand, plan, autoAccent) {
  const type = productTypeset(body, plan, brand),
    { blocks, headline, headerBottom, footerTop, features } = type;
  const { width: w, height: h, margin: m, geometry: g, accent } = plan,
    u = Math.min(w, h) / 1080;
  // At least 90% near-black covers every header/footer text pixel, independent of artwork.
  const worstBackdrop = '#202832',
    highlight = highlightColour(accent, worstBackdrop);
  const topEnd = headerBottom + 120 * u,
    topStop = Math.min(0.95, (headerBottom + 8 * u) / topEnd);
  const footerStart = footerTop - 100 * u,
    footerStop = Math.max(0.04, (100 * u) / (h - footerStart));
  const parts = [
    `<defs>
    <linearGradient id="top" x1="0" y1="0" x2="0" y2="${topEnd}" gradientUnits="userSpaceOnUse"><stop stop-color="#050d16" stop-opacity=".99"/><stop offset="${topStop}" stop-color="#050d16" stop-opacity=".90"/><stop offset="1" stop-color="#050d16" stop-opacity="0"/></linearGradient>
    <linearGradient id="bottom" x1="0" y1="${footerStart}" x2="0" y2="${h}" gradientUnits="userSpaceOnUse"><stop stop-color="#050d16" stop-opacity="0"/><stop offset="${footerStop}" stop-color="#050d16" stop-opacity=".94"/><stop offset="1" stop-color="#050d16" stop-opacity=".99"/></linearGradient>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${7 * u}"/></filter>
  </defs>
  <rect width="${w}" height="${topEnd}" fill="url(#top)"/>
  <rect y="${footerStart}" width="${w}" height="${h - footerStart}" fill="url(#bottom)"/>`,
  ];
  // Highlight the last headline line without changing any wording.
  headline.svg = headline.lines
    .map((line, i) =>
      outline(
        line,
        headline.box.x,
        headline.box.y + headline.baselines[i],
        headline.size,
        headline.family,
        i === headline.lines.length - 1 ? highlight : '#f8fbff',
      ),
    )
    .join('');
  if (g.badge) {
    const b = g.badge,
      cx = b.x + b.width / 2,
      cy = b.y + b.height / 2,
      r = b.width / 2;
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${highlight}" stroke-width="${12 * u}" opacity=".55" filter="url(#glow)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#07131f" fill-opacity=".98" stroke="${highlight}" stroke-width="${2 * u}"/>`,
    );
  }
  for (const block of blocks) {
    if (block.key === 'cta') {
      const width = Math.min(
        w - 2 * m,
        Math.max(...block.lines.map((line) => measure(line, block.size, block.family))) + 96 * u,
      );
      parts.push(
        `<rect x="${m}" y="${block.box.y - 18 * u}" width="${width}" height="${66 * u}" rx="${33 * u}" fill="${accent}"/><path d="m${m + width - 42 * u} ${block.box.y + 3 * u} 9 9-9 9" fill="none" stroke="${block.fill}" stroke-width="${3 * u}" stroke-linecap="round"/>`,
      );
    }
    if (block.key === 'offer.value') {
      block.fill = highlight;
      block.svg = block.lines
        .map((line, i) =>
          outline(
            line,
            block.box.x,
            block.box.y + block.baselines[i],
            block.size,
            block.family,
            highlight,
          ),
        )
        .join('');
    }
    parts.push(block.svg);
  }
  for (const { index, iconX, iconY } of features) {
    parts.push(
      `<circle cx="${iconX + 19 * u}" cy="${iconY + 19 * u}" r="${29 * u}" fill="#07131f" fill-opacity=".65" stroke="${highlight}" stroke-width="${1.6 * u}"/>`,
      featureIcon(body.features[index], iconX + 3 * u, iconY + 3 * u, 32 * u, highlight),
    );
  }
  const checks = {
    all_text_preserved: blocks.every(
      (b) => b.text.replace(/\s/g, '') === b.lines.join('').replace(/\s/g, ''),
    ),
    no_text_overflow: blocks.every(
      (b) =>
        b.box.x >= m * 0.4 &&
        b.box.y >= 0 &&
        b.box.x + b.box.width <= w - m * 0.4 &&
        b.box.y + b.height <= h,
    ),
    no_text_overlap: blocks.every((a, i) =>
      blocks.every(
        (b, j) =>
          i === j || !overlaps({ ...a.box, height: a.height }, { ...b.box, height: b.height }),
      ),
    ),
    readable_font_sizes: blocks.every(
      (b) =>
        b.size >=
        Math.floor(
          (b.key === 'headline'
            ? 38
            : b.key.startsWith('offer.')
              ? 12
              : b.key === 'eyebrow' || b.key === 'tagline'
                ? 14
                : 18) * u,
        ),
    ),
    text_contrast: Number(
      Math.min(contrast('#f8fbff', worstBackdrop), contrast(highlight, worstBackdrop)).toFixed(2),
    ),
    cta_contrast: body.cta
      ? Number(contrast(blocks.find((b) => b.key === 'cta').fill, accent).toFixed(2))
      : null,
    contrast_method:
      'Minimum 90% dark veils behind copy, with a conservative white-artwork contrast bound.',
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
      'Product promotion failed its text fit or readability checks. Shorten the copy or choose a taller canvas.',
    );
  const scene = await productScene(image.encoded, plan);
  const overlay = {
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join('')}</svg>`,
    ),
    left: 0,
    top: 0,
  };
  const layers = [scene.hero, overlay];
  const logo = await logoOverlay(brand, w, m, u, { maxWidth: 180, maxHeight: 64, top: m * 0.75 });
  if (logo) layers.push(logo);
  const buffer = await sharp(scene.base).composite(layers).png().toBuffer();
  const warnings = [];
  if (image.width < g.hero.width || image.height < g.hero.height)
    warnings.push(
      'Product artwork was enlarged; typography is rendered at final output resolution.',
    );
  if (highlight !== accent)
    warnings.push(
      'Headline accent was lightened for readable contrast; CTA retains your requested colour.',
    );
  return {
    buffer,
    design: {
      layout: 'product',
      full_bleed: true,
      font: plan.family,
      accent_color: accent,
      headline_accent_color: highlight,
      background_color: '#050d16',
      palette_source: autoAccent ? 'artwork' : 'brand_or_request',
      width: w,
      height: h,
      hero_area: g.hero,
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
          'Deterministic exact-copy, geometry, and conservative contrast checks. Product appearance and source artwork quality depend on the supplied image provider.',
      },
    },
  };
}
