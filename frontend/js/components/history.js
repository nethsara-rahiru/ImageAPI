import { escape, date } from '../core/html.js';
import { icon } from './icons.js';
const labels = { success: 'Success', failed: 'Failed', pending: 'In progress', unknown: 'Unknown' };
export function historyTable(
  requests,
  {
    emptyTitle = 'Your story starts with a request.',
    emptyText = 'Images you generate in the playground or through the API will appear here.',
  } = {},
) {
  if (!requests.length)
    return /* HTML */ `<div class="empty-state">
      <div class="empty-icon">${icon('image')}</div>
      <h3>${escape(emptyTitle)}</h3>
      <p>${escape(emptyText)}</p>
      <a class="btn btn-secondary btn-sm" href="/playground" data-link
        >Open playground ${icon('arrow')}</a
      >
    </div>`;
  return /* HTML */ `<div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th>Request / model</th>
          <th>Provider</th>
          <th>Source</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        ${requests
          .map(
            (row) =>
              /* HTML */ `<tr>
                <td>
                  <div class="table-primary">${escape(row.model)}</div>
                  <div class="table-secondary"><code>${escape(row.id)}</code></div>
                </td>
                <td>
                  ${escape({ fal: 'fal.ai', gemini: 'Gemini', openai: 'OpenAI', cloudflare: 'Cloudflare' }[row.provider] || row.provider)}
                </td>
                <td>
                  <span class="table-primary">${row.source === 'api' ? 'API' : 'Playground'}</span
                  >${row.key_name ? /* HTML */ `<div class="table-secondary">${escape(row.key_name)}</div>` : ''}
                </td>
                <td>
                  <span
                    class="badge ${row.status === 'success' ? 'badge-green' : row.status === 'failed' ? 'badge-red' : 'badge-blue'}"
                    ><span class="dot"></span>${labels[row.status] || escape(row.status)}</span
                  >
                </td>
                <td>
                  ${row.status === 'pending' ? '—' : `${(row.duration_ms / 1000).toFixed(1)}s`}
                </td>
                <td>
                  <div>${date(row.created_at)}</div>
                  <div class="table-secondary">
                    ${new Date(row.created_at * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}
