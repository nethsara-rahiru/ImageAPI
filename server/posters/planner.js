import { inkFor } from './typography.js';
import { posterSizes } from './catalog.js';
export function chooseLayout(body) {
  if (body.layout !== 'auto') return body.layout;
  const words = `${body.prompt} ${body.headline}`.toLowerCase();
  if (/\b(sale|discount|offer|shop|launch|buy)\b|%/.test(words)) return 'sale';
  if (/\b(concert|festival|event|party|music|conference|workshop)\b/.test(words)) return 'event';
  if (
    /\b(luxury|gallery|exhibition|art|architecture|architectural|editorial|fashion)\b/.test(words)
  )
    return 'editorial';
  if (/\b(minimal|wellness|spa|yoga|calm)\b/.test(words)) return 'minimal';
  return 'bold';
}
export function planPoster(body, brand) {
  const { width: w, height: h } = posterSizes[body.size],
    layout = chooseLayout(body),
    landscape = w / h > 1.2;
  const accent =
    body.accent_color ||
    brand?.accent_color ||
    {
      editorial: '#b94b30',
      bold: '#d7fa52',
      minimal: '#355b4d',
      event: '#a9caff',
      sale: '#ed492e',
    }[layout];
  const paper = brand?.background_color || (layout === 'minimal' ? '#f1f3ed' : '#f8f3e9');
  const dark = ['bold', 'event'].includes(layout),
    background = dark ? '#101b29' : paper,
    foreground = inkFor(background);
  const margin = Math.round(Math.min(w, h) * 0.065);
  let art, zone;
  if (landscape) {
    art = { x: Math.round(w * 0.48), y: 0, width: Math.ceil(w * 0.52), height: h };
    zone = {
      x: margin,
      y: Math.round(h * 0.19),
      width: Math.round(w * 0.4) - margin,
      height: Math.round(h * 0.64),
    };
  } else {
    art = { x: 0, y: 0, width: w, height: Math.round(h * (layout === 'event' ? 0.52 : 0.48)) };
    zone = {
      x: margin,
      y: art.height + Math.round(h * 0.036),
      width: w - margin * 2,
      height: h - art.height - Math.round(h * 0.13),
    };
  }
  const family =
    body.font ||
    brand?.font ||
    (layout === 'editorial' ? 'serif' : layout === 'minimal' ? 'sans' : 'display');
  return {
    width: w,
    height: h,
    layout,
    accent,
    background,
    foreground,
    margin,
    art,
    zone,
    family,
    dark,
    landscape,
  };
}
export function artworkPrompt(body, plan) {
  const palette = plan.dark
    ? 'cinematic rich shadows and luminous accents'
    : 'refined natural light and carefully balanced tones';
  const prefix = `Professional poster artwork, no text, no lettering, no typography, no logo, no watermark. ${palette}. A single strong focal subject, uncluttered composition, premium commercial photography or illustration. Harmonise the palette with ${plan.accent} and ${plan.background}. `;
  const suffix = ` Keep important subjects in the central 70 percent for cropping. Artwork direction: ${body.prompt}`;
  // Reserve instructions even when the caller supplies a very long prompt.
  return (prefix + suffix).slice(0, body.provider === 'cloudflare' ? 2048 : 6000);
}
