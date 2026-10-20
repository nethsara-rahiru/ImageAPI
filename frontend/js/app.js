import { api } from './core/api.js';
import { escape } from './core/html.js';
import { state, setSession } from './core/state.js';
import { navigate, startRouter } from './core/router.js';
import { closeModal, showSecrets } from './components/modal.js';
import * as landing from './pages/landing.js';
import * as pricing from './pages/pricing.js';
import * as auth from './pages/auth.js';
import * as dashboard from './pages/dashboard.js';
import * as keys from './pages/api-keys.js';
import * as playground from './pages/playground.js';
import * as settings from './pages/settings.js';
import * as docs from './pages/docs.js';
const app = document.querySelector('#app');
const protectedPaths = new Set(['/dashboard', '/api', '/playground', '/settings']);
const titles = {
  '/': 'Ideas into images',
  '/pricing': 'Plans & pricing',
  '/login': 'Welcome back',
  '/signup': 'Create your workspace',
  '/recover': 'Account recovery',
  '/dashboard': 'Overview',
  '/api': 'API keys & playground',
  '/playground': 'Playground',
  '/settings': 'Settings',
  '/docs': 'Documentation',
};
let sequence = 0,
  cleanup = null;
async function render() {
  const current = ++sequence;
  let path = location.pathname.replace(/\/$/, '') || '/';
  if (protectedPaths.has(path) && !state.user) {
    navigate('/login', { replace: true });
    return;
  }
  if (['/signup', '/login'].includes(path) && state.user) {
    navigate('/dashboard', { replace: true });
    return;
  }
  cleanup?.();
  cleanup = null;
  closeModal();
  document.title = `${titles[path] || 'Page not found'} — ImageAPI`;
  app.setAttribute('aria-busy', 'true');
  const timer = setTimeout(() => {
    if (current === sequence)
      app.innerHTML =
        '<div class="loading-shell"><div role="status"><span class="spinner" aria-hidden="true"></span>Opening your workspace…</div></div>';
  }, 160);
  try {
    const page = await (path === '/'
      ? landing.render()
      : path === '/pricing'
        ? pricing.render()
        : ['/login', '/signup', '/recover'].includes(path)
          ? auth.render(path.slice(1))
          : path === '/dashboard'
            ? dashboard.render()
            : path === '/api'
              ? keys.render()
              : path === '/playground'
                ? playground.render()
                : path === '/settings'
                  ? settings.render()
                  : path === '/docs'
                    ? docs.render()
                    : Promise.reject(new Error('This page doesn’t exist.')));
    if (current !== sequence) return;
    app.innerHTML = page.html;
    page.mount?.();
    cleanup = page.unmount || null;
    window.scrollTo(0, 0);
    if (location.hash) {
      requestAnimationFrame(() =>
        document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(),
      );
    }
    if (state.pendingSecrets) {
      const secrets = state.pendingSecrets;
      state.pendingSecrets = null;
      showSecrets(secrets);
    }
    const main = document.querySelector('#main');
    main?.setAttribute('tabindex', '-1');
  } catch (error) {
    if (current !== sequence) return;
    if (error.status === 401 && protectedPaths.has(path)) {
      setSession(null);
      navigate('/login', { replace: true });
      return;
    }
    app.innerHTML = /* HTML */ `<main id="main" class="page-error">
      <h1>A small pause.</h1>
      <p>${escape(error.message)}</p>
      <button class="btn btn-primary" id="retry-page">Try again</button
      ><a class="btn btn-secondary" href="/" data-link>Back to home</a>
    </main>`;
    document.querySelector('#retry-page')?.addEventListener('click', () => render());
  } finally {
    clearTimeout(timer);
    if (current === sequence) app.removeAttribute('aria-busy');
  }
}
try {
  setSession(await api('/api/auth/me'));
} catch (error) {
  if (error.status !== 401)
    console.warn('Session check unavailable. You can try signing in again.');
}
startRouter(render);
