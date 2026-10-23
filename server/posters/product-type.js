import { fitBlock, inkFor, contrast } from './typography.js';
import { outline } from './fonts.js';
import { HttpError } from '../lib/errors.js';
export function highlightColour(accent, backdrop) {
  let colour = accent;
  for (let step = 0; step < 8 && contrast(colour, backdrop) < 4.5; step++) {
    colour =
      '#' +
      colour
        .slice(1)
        .match(/../g)
        .map((part) =>
          Math.round(parseInt(part, 16) * 0.72 + 255 * 0.28)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
  }
  return colour;
}
export function productTypeset(body, plan, brand) {
  const { width: w, height: h, geometry: g, margin: m, family } = plan,
    u = Math.min(w, h) / 1080;
  const blocks = [];
  const add = (key, text, box, max, min, font = 'sans', fill = '#f8fbff', maxLines = 30) => {
    if (!text) return null;
    const block = {
      ...fitBlock(text, box, {
        family: font,
        maxSize: max * u,
        minSize: Math.floor(min * u),
        fill,
        maxLines,
      }),
      key,
    };
    blocks.push(block);
    return block;
  };
  const headline = add('headline', body.headline, g.header, 132, 38, family, '#f8fbff', 5);
  const subtitle = add(
    'subtitle',
    body.subtitle,
    {
      x: g.header.x,
      y: g.header.y + headline.height + 16 * u,
      width: g.header.width,
      height: Math.min(h * 0.105, 120 * u),
    },
    32,
    22,
  );
  const headerBottom = subtitle
    ? subtitle.box.y + subtitle.height
    : headline.box.y + headline.height;
  if (!plan.landscape && headerBottom > g.hero.y + g.hero.height * 0.3)
    throw new HttpError(422, 'Shorten the headline or subtitle to leave room for the product.');
  const label = body.eyebrow || brand?.name || '';
  add('eyebrow', label, g.label, 25, 16, 'sans', '#f8fbff', 2);
  if (g.badge) {
    const badge = g.badge;
    add(
      'offer.label',
      body.offer.label,
      {
        x: badge.x + badge.width * 0.16,
        y: badge.y + badge.height * 0.2,
        width: badge.width * 0.68,
        height: badge.height * 0.16,
      },
      24,
      16,
      'display',
      '#f8fbff',
      1,
    );
    add(
      'offer.value',
      body.offer.value,
      {
        x: badge.x + badge.width * 0.12,
        y: badge.y + badge.height * 0.37,
        width: badge.width * 0.76,
        height: badge.height * 0.38,
      },
      72,
      26,
      'display',
      '#f8fbff',
      1,
    );
    if (body.offer.caption)
      add(
        'offer.caption',
        body.offer.caption,
        {
          x: badge.x + badge.width * 0.16,
          y: badge.y + badge.height * 0.8,
          width: badge.width * 0.68,
          height: badge.height * 0.15,
        },
        16,
        12,
        'sans',
        '#f8fbff',
        2,
      );
  }
  let bottom = h - m - (brand?.tagline ? 28 * u : 0);
  const ctaHeight = body.cta ? 66 * u : 0;
  const cta = add(
    'cta',
    body.cta,
    {
      x: m + 30 * u,
      y: bottom - ctaHeight + 18 * u,
      width: Math.min(w - 2 * m - 80 * u, 690 * u),
      height: ctaHeight - 28 * u,
    },
    28,
    20,
    'display',
    inkFor(plan.accent),
    1,
  );
  if (cta) bottom -= ctaHeight + 24 * u;
  const details = add(
    'details',
    body.details.join('\n'),
    { x: m, y: 0, width: w - 2 * m, height: h * 0.17 },
    23,
    20,
  );
  if (details) {
    details.box.y = bottom - details.height;
    details.svg = details.lines
      .map((line, i) =>
        outline(
          line,
          details.box.x,
          details.box.y + details.baselines[i],
          details.size,
          details.family,
          details.fill,
        ),
      )
      .join('');
    bottom -= details.height + 20 * u;
  }
  const features = [];
  if (body.features?.length) {
    const column = (w - 2 * m) / body.features.length;
    for (let index = 0; index < body.features.length; index++) {
      const box = {
        x: m + index * column + 52 * u,
        y: bottom - 54 * u,
        width: column - 68 * u,
        height: 54 * u,
      };
      const block = add(
        'features.' + index,
        body.features[index],
        box,
        23,
        18,
        'sans',
        '#f8fbff',
        2,
      );
      features.push({ index, block, iconX: m + index * column, iconY: box.y + 3 * u });
    }
    bottom -= 80 * u;
  }
  if (brand?.tagline)
    add(
      'tagline',
      brand.tagline,
      { x: m, y: h - m + 8 * u, width: w - 2 * m, height: 30 * u },
      17,
      14,
      'sans',
      '#f8fbff',
      1,
    );
  const footerTop = Math.min(
    bottom,
    ...blocks.filter((b) => ['cta', 'details'].includes(b.key)).map((b) => b.box.y),
  );
  if (footerTop < headerBottom + Math.min(h * 0.14, 180 * u))
    throw new HttpError(
      422,
      'This promotion has too much copy to leave a clear product area. Shorten the supporting text or use a taller canvas.',
    );
  return { blocks, headline, headerBottom, footerTop, features };
}
