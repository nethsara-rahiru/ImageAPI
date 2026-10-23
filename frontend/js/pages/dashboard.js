import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { escape, number, date } from '../core/html.js';
import { navigate } from '../core/router.js';
import { workspaceLayout, pageHeading, bindWorkspace } from '../components/workspace-layout.js';
import { icon } from '../components/icons.js';
import { usageChart } from '../components/chart.js';
import { historyTable } from '../components/history.js';
export async function render() {
  const params = new URLSearchParams(location.search);
  const page = Math.max(1, Number(params.get('page')) || 1),
    status = params.get('status') || 'all';
  const [usage, { providers }] = await Promise.all([
    api(`/api/usage?page=${page}&status=${encodeURIComponent(status)}`),
    api('/api/providers'),
  ]);
  const s = usage.summary;
  const percent = Math.min(100, (s.used / s.limit) * 100);
  const month = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return {
    html: workspaceLayout(
      `${pageHeading(
        'A little overview.',
        `Welcome back, ${state.user.name.split(' ')[0]}. Here’s how your ideas are taking shape.`,
        /* HTML */ `<div class="date-label">${icon('calendar')}${escape(month)}</div>
          <a class="btn btn-primary" href="/posters" data-link>${icon('plus')} Create a poster</a>`,
      )}${
        s.connected_providers === 0
          ? /* HTML */ `<section class="welcome-card">
              <div>
                <h2>Your workspace. Meet your imagination.</h2>
                <p>
                  Connect your first provider to start generating. Your ImageAPI key is ready; now
                  bring the AI behind it.
                </p>
              </div>
              <span class="welcome-decoration" aria-hidden="true"></span
              ><a class="btn btn-primary btn-sm" href="/settings" data-link
                >Connect a provider ${icon('arrow')}</a
              >
            </section>`
          : ''
      }<section class="stats-grid" aria-label="Monthly statistics"><article class="stat-card"><div class="stat-label">Images generated ${icon('image')}</div><div class="stat-value">${number(s.images)} <small>/ ${number(s.limit)}</small></div><div class="stat-note"><span class="dot"></span> Successful images this month</div></article><article class="stat-card"><div class="stat-label">Total requests ${icon('chart')}</div><div class="stat-value">${number(s.requests)}</div><div class="stat-note">Playground & API combined</div></article><article class="stat-card"><div class="stat-label">Success rate ${icon('check')}</div><div class="stat-value">${s.success_rate === null ? '—' : `${s.success_rate}<small>%</small>`}</div><div class="stat-note">${s.requests ? `${number(s.failed)} failed requests this month` : 'Your first request starts the story'}</div></article><article class="stat-card"><div class="stat-label">Average generation ${icon('clock')}</div><div class="stat-value">${s.average_ms === null ? '—' : `${(s.average_ms / 1000).toFixed(1)}<small>s</small>`}</div><div class="stat-note">Across successful requests</div></article></section><section class="dashboard-grid"><div class="card chart-card"><div class="card-head"><div><h3>Your creative activity</h3><p class="chart-subtitle">Successful images over the last 30 days · UTC</p></div><span class="badge">30 DAYS</span></div><div class="chart-area">${usageChart(usage.daily)}${usage.daily.every((d) => !d.count) ? '<div class="chart-empty"><strong>A blank canvas, for now.</strong><span>Your creative activity will grow here.</span></div>' : ''}</div><div class="chart-footer"><span class="dot"></span> Images generated</div></div><div class="card quota-card"><h3>A little room to create.</h3><p>Your monthly ImageAPI allowance.<br>Provider charges are separate.</p><div class="quota-ring"><svg viewBox="0 0 112 112" aria-hidden="true"><circle class="ring-track" cx="56" cy="56" r="48"/><circle class="ring-value" cx="56" cy="56" r="48" stroke-dashoffset="${302 * (1 - percent / 100)}"/></svg><strong>${Math.round(percent)}%<small>of your allowance</small></strong></div><div class="quota-detail"><span>${number(s.used)} / ${number(s.limit)} used</span><span>Resets ${date(s.reset_at)}</span></div><a class="btn btn-secondary btn-sm btn-block" href="/pricing" data-link>View your plan ${icon('arrow')}</a></div></section><div class="section-label"><h2>Your connected providers</h2><a class="text-link" href="/settings" data-link>Manage connections ${icon('arrow')}</a></div><section class="connections-grid">${providers
        .map(
          (provider) =>
            /* HTML */ `<a class="connection-card" href="/settings" data-link
              ><div class="provider-icon ${provider.id}">${icon(provider.id)}</div>
              <div>
                <h3>${escape(provider.name)}</h3>
                <p>
                  ${provider.connected ? 'Key saved · ' + escape(provider.hint) : 'Ready when you are'}
                </p>
              </div>
              <span
                class="connection-dot ${provider.connected ? 'connected' : ''}"
                aria-label="${provider.connected ? 'Key saved' : 'Not connected'}"
              ></span
            ></a>`,
        )
        .join(
          '',
        )}</section><section class="card"><div class="card-head"><div><h3>Recent requests</h3><p class="chart-subtitle">Metadata only. Your prompts and images stay out of the log.</p></div><select class="table-filter" id="history-status" aria-label="Filter request status">${['all', 'success', 'failed', 'pending', 'unknown'].map((value) => /* HTML */ `<option value="${value}" ${status === value ? 'selected' : ''}>${{ all: 'All requests', success: 'Successful', failed: 'Failed', pending: 'In progress', unknown: 'Unknown' }[value]}</option>`).join('')}</select></div>${historyTable(usage.requests, { emptyTitle: status === 'all' ? undefined : 'No matching requests yet.' })}<div class="pagination"><span>${usage.pagination.total ? `${(page - 1) * 10 + 1}–${Math.min(page * 10, usage.pagination.total)} of ${number(usage.pagination.total)} requests` : 'No requests yet'}</span><div><button class="btn btn-secondary btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button><button class="btn btn-secondary btn-sm" data-page="${page + 1}" ${page >= usage.pagination.pages ? 'disabled' : ''}>Next</button></div></div></section>`,
      '/dashboard',
    ),
    mount() {
      bindWorkspace();
      document
        .querySelector('#history-status')
        .addEventListener('change', (event) => navigate(`/dashboard?status=${event.target.value}`));
      document
        .querySelectorAll('[data-page]')
        .forEach((button) =>
          button.addEventListener('click', () =>
            navigate(`/dashboard?page=${button.dataset.page}&status=${status}`),
          ),
        );
    },
  };
}
