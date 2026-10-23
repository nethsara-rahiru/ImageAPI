export const posterSizes = {
  square: { width: 1080, height: 1080, label: 'Square · 1080 × 1080' },
  portrait: { width: 1080, height: 1350, label: 'Social portrait · 1080 × 1350' },
  story: { width: 1080, height: 1920, label: 'Story · 1080 × 1920' },
  landscape: { width: 1920, height: 1080, label: 'Landscape · 1920 × 1080' },
  a4: { width: 1654, height: 2339, label: 'A4 · 1654 × 2339 (141 dpi)' },
};
export const layouts = [
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Warm paper, generous margins, expressive serif typography.',
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Deep ink, oversize headlines, confident colour accents.',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean typography, quiet neutrals, framed artwork.',
  },
  {
    id: 'event',
    name: 'Event',
    description: 'Immersive artwork, luminous accents, a clear information hierarchy.',
  },
  {
    id: 'sale',
    name: 'Promotion',
    description: 'Product-forward composition with an unmistakable call to action.',
  },
];
export const fonts = ['sans', 'display', 'serif'];
export const posterCatalog = () => ({
  sizes: posterSizes,
  layouts,
  fonts,
  formats: ['png', 'jpeg', 'webp'],
});
