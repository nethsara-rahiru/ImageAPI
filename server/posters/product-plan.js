export function productGeometry(width, height, margin, hasOffer) {
  const u = Math.min(width, height) / 1080,
    wide = width / height > 1.2;
  const badgeSize = Math.round(Math.min(width * 0.23, 240 * u));
  const headerY = Math.round(wide ? height * 0.22 : height * 0.115);
  return {
    full_bleed: true,
    hero: wide
      ? {
          x: Math.round(width * 0.4),
          y: Math.round(height * 0.1),
          width: Math.round(width * 0.6),
          height: Math.round(height * 0.8),
        }
      : { x: 0, y: Math.round(height * 0.32), width, height: Math.round(height * 0.49) },
    header: {
      x: margin,
      y: headerY,
      width: wide
        ? Math.round(width * 0.43) - margin
        : width - 2 * margin - (hasOffer ? badgeSize + 30 * u : 0),
      height: Math.round(height * (wide ? 0.4 : 0.22)),
    },
    badge: hasOffer
      ? {
          x: width - margin - badgeSize,
          y: wide ? margin : headerY,
          width: badgeSize,
          height: badgeSize,
        }
      : null,
    footer: {
      x: margin,
      y: Math.round(height * (wide ? 0.69 : 0.8)),
      width: width - 2 * margin,
      height: Math.round(height * (wide ? 0.24 : 0.15)),
    },
    label: {
      x: margin,
      y: Math.round(margin * 0.9),
      width: width - 2 * margin - 220 * u,
      height: 60 * u,
    },
  };
}
