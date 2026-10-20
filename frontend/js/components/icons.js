const paths = {
  image:
    '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="16" cy="8" r="1.5"/><path d="m3 17 6-7 6 7 3-4 3 4"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  key: '<circle cx="8" cy="9" r="5"/><path d="m12 13 8 8m-4-4 3-3m-6 0 3-3"/>',
  sparkles:
    '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4"/>',
  settings:
    '<path d="m10 3-1 3-3 1-3-1-1 3 2 3-1 3 2 3 3-1 3 2 3-1 2-3 3-1-1-3 1-3-3-1-1-3z"/><circle cx="11" cy="12" r="3"/>',
  book: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/>',
  logout: '<path d="M9 4H4v16h5m6-13 5 5-5 5m5-5H9"/>',
  external: '<path d="M14 3h7v7m0-7L10 14m-1-9H4v16h16v-5"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8z"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
  chart: '<path d="M4 3v17h17M8 15l4-5 4 2 5-7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  refresh: '<path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5m-3 9a9 9 0 0 0 15 2l3-3m0 5v-5h-5"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9zM2 13l10 6 10-6M2 17l10 6 10-6"/>',
  openai:
    '<path d="M12 4c-6-5-13 5-6 9m6-9c7-2 12 7 6 10M6 13c-2 7 8 12 11 5m1-4c5 6-5 13-9 6m8-2c-3 7-14 2-12-5m4 7C2 22-3 12 4 8"/><path d="m8 8 8 1 1 7-7 2-4-6z"/>',
  gemini: '<path d="M12 2c0 6-4 10-10 10 6 0 10 4 10 10 0-6 4-10 10-10-6 0-10-4-10-10Z"/>',
  cloudflare: '<path d="M7 18h12a3 3 0 0 0 0-6h-1a6 6 0 0 0-12-1 4 4 0 0 0 1 8m-4 2h18"/>',
  fal: '<path d="m3 4 9 8-9 8m9-16 9 8-9 8"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
};
export function icon(name, extra = '') {
  return /* HTML */ `<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true">
    ${paths[name] || paths.image}
  </svg>`;
}
export function brand() {
  return /* HTML */ `<a class="brand" href="/" data-link aria-label="ImageAPI home"
    ><span class="brand-mark">${icon('image')}</span><span>image<em>API</em></span></a
  >`;
}
