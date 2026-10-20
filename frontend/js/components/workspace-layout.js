import { api } from '../core/api.js';
import { escape, initials } from '../core/html.js';
import { state, setSession } from '../core/state.js';
import { navigate } from '../core/router.js';
import { toast } from './toast.js';
import { brand, icon } from './icons.js';
const links = [
  ['/dashboard', 'grid', 'Overview'],
  ['/api', 'key', 'API keys'],
  ['/playground', 'sparkles', 'Playground'],
  ['/settings', 'settings', 'Settings'],
];
export function workspaceLayout(content, path) {
  const current = links.find((item) => item[0] === path)?.[2] || 'Workspace';
  return /* HTML */ `<div class="workspace">
    <div class="sidebar-scrim"></div>
    <aside class="sidebar">
      ${brand()}
      <div class="workspace-label">Your workspace</div>
      <nav class="side-nav" aria-label="Workspace navigation">
        ${links.map(([href, name, label]) => /* HTML */ `<a class="side-link ${href === path ? 'active' : ''}" href="${href}" data-link ${href === path ? 'aria-current="page"' : ''}>${icon(name)}${label}</a>`).join('')}
        <div class="side-divider"></div>
        <a class="side-link" href="/docs" data-link
          >${icon('book')}Documentation ${icon('external')}</a
        ><a class="side-link" href="/pricing" data-link>${icon('layers')}Plans & pricing</a>
      </nav>
      <div class="sidebar-bottom">
        <div class="plan-mini">
          <div class="plan-mini-title">Free plan ${icon('sparkles')}</div>
          <p>Your ideas have room to grow.<br />100 images every month.</p>
          <a href="/pricing" data-link>Explore the plans ${icon('arrow')}</a>
        </div>
        <div class="user-menu">
          <span class="avatar">${escape(initials(state.user.name))}</span>
          <div class="user-menu-copy">
            <strong>${escape(state.user.name)}</strong><small>${escape(state.user.email)}</small>
          </div>
          <button class="btn btn-icon" data-logout aria-label="Sign out" title="Sign out">
            ${icon('logout')}
          </button>
        </div>
      </div>
    </aside>
    <div class="workspace-main">
      <header class="workspace-topbar">
        <button
          class="btn btn-icon sidebar-toggle"
          data-sidebar-toggle
          aria-label="Open navigation"
          aria-expanded="false"
        >
          ${icon('menu')}
        </button>
        <div class="breadcrumb">Workspace ${icon('chevron')}<strong>${current}</strong></div>
        <div class="topbar-actions">
          <span class="status"><span class="dot"></span> Local workspace</span
          ><a href="/docs" data-link>API docs ${icon('external')}</a
          ><span class="avatar" aria-label="${escape(state.user.name)}"
            >${escape(initials(state.user.name))}</span
          >
        </div>
      </header>
      <main id="main" class="page-content page-enter">${content}</main>
    </div>
  </div>`;
}
export function bindWorkspace() {
  const side = document.querySelector('.sidebar'),
    scrim = document.querySelector('.sidebar-scrim'),
    button = document.querySelector('[data-sidebar-toggle]');
  const close = () => {
    side.classList.remove('open');
    scrim.classList.remove('visible');
    button.setAttribute('aria-expanded', 'false');
  };
  button?.addEventListener('click', () => {
    const open = side.classList.toggle('open');
    scrim.classList.toggle('visible', open);
    button.setAttribute('aria-expanded', String(open));
  });
  scrim?.addEventListener('click', close);
  document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      setSession(null);
      navigate('/login');
      toast('You’ve been signed out');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}
export function pageHeading(title, subtitle, actions = '') {
  return /* HTML */ `<div class="page-heading">
    <div>
      <h1>${escape(title)}</h1>
      <p>${escape(subtitle)}</p>
    </div>
    <div class="heading-actions">${actions}</div>
  </div>`;
}
