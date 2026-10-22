import { openSync } from 'fontkit';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../lib/errors.js';
const load = (name) =>
  openSync(fileURLToPath(new URL(`../assets/fonts/${name}.ttf`, import.meta.url)));
const faces = { sans: load('Sans'), display: load('Display'), serif: load('Serif') };
const fallbacks = [load('Sinhala'), load('Tamil')];
const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export const graphemes = (text) => [...segments.segment(text)].map((s) => s.segment);
function runs(text, family) {
  const base = faces[family] || faces.sans,
    result = [];
  for (const segment of graphemes(text)) {
    const codes = [...segment]
      .map((c) => c.codePointAt(0))
      .filter((c) => ![0x200c, 0x200d, 0xfe0f].includes(c));
    const font = [base, faces.sans, ...fallbacks].find((f) =>
      codes.every((code) => f.hasGlyphForCodePoint(code)),
    );
    if (!font)
      throw new HttpError(
        422,
        'Some poster characters are not supported by the bundled fonts. Use Latin, Greek, Cyrillic, Arabic, Sinhala, or Tamil text without emoji.',
      );
    if (result.at(-1)?.font === font) result.at(-1).text += segment;
    else result.push({ font, text: segment });
  }
  return result;
}
export function measure(text, size, family = 'sans') {
  return runs(text, family).reduce(
    (sum, { font, text }) =>
      sum +
      (font.layout(text).positions.reduce((width, pos) => width + pos.xAdvance, 0) * size) /
        font.unitsPerEm,
    0,
  );
}
export function validateCharacters(texts, family = 'sans') {
  texts.forEach((text) => runs(text.replace(/\n/g, ' '), family));
}
export function outline(text, x, baseline, size, family, fill) {
  let cursor = x;
  const paths = [];
  for (const { font, text: part } of runs(text, family)) {
    const shaped = font.layout(part),
      scale = size / font.unitsPerEm;
    shaped.glyphs.forEach((glyph, index) => {
      const pos = shaped.positions[index];
      paths.push(
        `<path fill="${fill}" d="${glyph.path.toSVG()}" transform="translate(${(cursor + pos.xOffset * scale).toFixed(3)} ${(baseline - pos.yOffset * scale).toFixed(3)}) scale(${scale} ${-scale})"/>`,
      );
      cursor += pos.xAdvance * scale;
    });
  }
  return paths.join('');
}
export function wrap(text, width, size, family) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? line + ' ' + word : word;
      if (measure(candidate, size, family) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      if (measure(word, size, family) <= width) {
        line = word;
        continue;
      }
      for (const char of graphemes(word)) {
        if (line && measure(line + char, size, family) > width) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function verticalMetrics(text, size, family = 'sans') {
  let ascent = size * 0.86,
    descent = size * 0.2;
  for (const { font, text: part } of runs(text, family)) {
    const shaped = font.layout(part),
      scale = size / font.unitsPerEm;
    shaped.glyphs.forEach((glyph, index) => {
      const bounds = glyph.bbox,
        pos = shaped.positions[index];
      if (Number.isFinite(bounds.maxY))
        ascent = Math.max(ascent, (bounds.maxY + pos.yOffset) * scale);
      if (Number.isFinite(bounds.minY))
        descent = Math.max(descent, -(bounds.minY + pos.yOffset) * scale);
    });
  }
  return { ascent, descent };
}
