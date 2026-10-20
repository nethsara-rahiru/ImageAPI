import { escape, number, date } from '../core/html.js';
export function usageChart(days) {
  const width = 650,
    height = 195,
    left = 28,
    right = 10,
    top = 15,
    bottom = 30;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const maximum = Math.max(4, ...days.map((d) => d.count));
  const bars = days
    .map((item, i) => {
      const x = left + i * (plotWidth / 30) + 2,
        y = top + plotHeight - (item.count / maximum) * plotHeight,
        barHeight = (item.count / maximum) * plotHeight;
      return /* HTML */ `<rect
        class="chart-bar"
        x="${x.toFixed(2)}"
        y="${y.toFixed(2)}"
        width="${(plotWidth / 30 - 5).toFixed(2)}"
        height="${Math.max(0, barHeight).toFixed(2)}"
        rx="3"
        ><title>${escape(item.day)}: ${number(item.count)} images</title></rect
      >`;
    })
    .join('');
  const grid = [0, 1, 2, 3, 4]
    .map((i) => {
      const y = top + i * (plotHeight / 4);
      return /* HTML */ `<line
          class="chart-gridline"
          x1="${left}"
          y1="${y}"
          x2="${width - right}"
          y2="${y}"
        /><text class="chart-axis" x="${left - 10}" y="${y + 3}" text-anchor="end"
          >${Math.round(maximum * (1 - i / 4))}</text
        >`;
    })
    .join('');
  const labels = [0, 7, 14, 21, 29]
    .map(
      (i) =>
        /* HTML */ `<text
          class="chart-axis"
          x="${left + i * (plotWidth / 30)}"
          y="${height - 7}"
          text-anchor="${i === 29 ? 'end' : 'start'}"
          >${escape(new Date(days[i].day + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }))}</text
        >`,
    )
    .join('');
  return /* HTML */ `<svg
    class="usage-chart"
    viewBox="0 0 ${width} ${height}"
    role="img"
    aria-label="Successful image generations over the last 30 days. ${days.reduce((sum, d) => sum + d.count, 0)} images total."
  >
    ${grid}${bars}${labels}
  </svg>`;
}
