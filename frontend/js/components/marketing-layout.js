import { state } from '../core/state.js';
import { brand, icon } from './icons.js';
export function marketingLayout(content, active = '') {
  return /* HTML */ `<div class="marketing">
    <div class="container">
      <nav class="site-nav" aria-label="Main navigation">
        ${brand()}
        <div class="site-nav-links">
          <a href="/#features" data-link>Features</a
          ><a href="/pricing" data-link class="${active === 'pricing' ? 'active' : ''}">Pricing</a
          ><a href="/docs" data-link class="${active === 'docs' ? 'active' : ''}">Documentation</a>
        </div>
        <div class="nav-actions">
          ${state.user ? /* HTML */ `<a class="btn btn-primary" href="/dashboard" data-link>Dashboard ${icon('arrow')}</a>` : /* HTML */ `<a class="btn btn-ghost" href="/login" data-link>Log in</a><a class="btn btn-primary" href="/signup" data-link>Start building ${icon('arrow')}</a>`}<button
            class="btn btn-icon mobile-toggle"
            data-mobile-menu
            aria-label="Toggle navigation"
            aria-expanded="false"
          >
            ${icon('menu')}
          </button>
        </div>
      </nav>
    </div>
    <main id="main" class="page-enter">${content}</main>
    <footer class="site-footer">
      <div class="container footer-inner">
        ${brand()}
        <p>© ${new Date().getFullYear()} ImageAPI. A little imagination, a lot of possibility.</p>
        <div class="footer-links">
          <a href="/docs" data-link>Documentation</a><a href="/pricing" data-link>Pricing</a
          ><a
            href="https://github.com/nethsara-rahiru/ImageAPI"
            target="_blank"
            rel="noopener noreferrer"
            >GitHub ${icon('external')}</a
          >
        </div>
      </div>
    </footer>
  </div>`;
}
export function bindMarketing() {
  const button = document.querySelector('[data-mobile-menu]');
  button?.addEventListener('click', () => {
    const open = document.querySelector('.site-nav-links').classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
  });
}
