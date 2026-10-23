const shapes = {
  wireless: '<path d="m11 2 8 6-8 6V2Zm0 8 8 6-8 6V10ZM4 6l14 12M4 18 18 6"/>',
  sound: '<path d="M3 10h4l5-5v14l-5-5H3v-4Zm13-3c3 2 3 8 0 10m3-13c5 4 5 12 0 16"/>',
  battery:
    '<rect x="2" y="6" width="18" height="12" rx="2"/><path d="M22 10v4M7 9v6m4-6v6m4-6v6"/>',
  box: '<path d="m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5m-9 5v10"/>',
};
export function featureIcon(text, x, y, size, colour) {
  const kind = /wireless|bluetooth|connect/i.test(text)
    ? 'wireless'
    : /bass|sound|audio/i.test(text)
      ? 'sound'
      : /battery|hour|charge/i.test(text)
        ? 'battery'
        : 'box';
  return `<g transform="translate(${x} ${y}) scale(${size / 24})" stroke="${colour}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">${shapes[kind]}</g>`;
}
