import { escape } from '../core/html.js';
import { icon } from './icons.js';
import { copy } from './toast.js';
let dispose = null;
export function closeModal() {
  dispose?.();
}
export function modal(title, html, { onMount, onClose, locked = false } = {}) {
  closeModal();
  const root = document.querySelector('#modal-root');
  const previous = document.activeElement;
  root.innerHTML = /* HTML */ `<div class="modal-backdrop">
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head">
        <h2 id="modal-title">${escape(title)}</h2>
        ${locked ? '' : /* HTML */ `<button class="btn btn-icon" data-close-modal aria-label="Close dialog">${icon('close')}</button>`}
      </div>
      <div class="modal-body">${html}</div>
    </section>
  </div>`;
  document.body.style.overflow = 'hidden';
  const close = () => {
    root.innerHTML = '';
    document.body.style.overflow = '';
    document.removeEventListener('keydown', keydown);
    dispose = null;
    onClose?.();
    previous?.isConnected && previous.focus();
  };
  const keydown = (event) => {
    if (event.key === 'Escape' && !locked) close();
    if (event.key === 'Tab') {
      const nodes = [
        ...root.querySelectorAll(
          'button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]',
        ),
      ];
      const first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };
  dispose = close;
  document.addEventListener('keydown', keydown);
  root
    .querySelectorAll('[data-close-modal]')
    .forEach((button) => button.addEventListener('click', close));
  root.querySelector('.modal-backdrop').addEventListener('click', (event) => {
    if (!locked && event.target.classList.contains('modal-backdrop')) close();
  });
  onMount?.(root, close);
  queueMicrotask(() => root.querySelector('input,button,a')?.focus());
  return close;
}
export function showSecrets({ api_key, recovery_code }, title = 'Your workspace is ready') {
  const text = [
    api_key && `ImageAPI key: ${api_key}`,
    recovery_code && `Account recovery code: ${recovery_code}`,
  ]
    .filter(Boolean)
    .join('\n');
  modal(
    title,
    /* HTML */ `<p>Save these somewhere safe. They’re shown only once.</p>
      ${
        api_key
          ? /* HTML */ `<label class="field-label">Your ImageAPI key</label>
              <div class="secret-box">
                <code>${escape(api_key)}</code
                ><button class="btn btn-icon" data-copy="api" aria-label="Copy ImageAPI key">
                  ${icon('copy')}
                </button>
              </div>`
          : ''
      }${
        recovery_code
          ? /* HTML */ `<label class="field-label">Account recovery code</label>
              <div class="secret-box">
                <code>${escape(recovery_code)}</code
                ><button class="btn btn-icon" data-copy="recovery" aria-label="Copy recovery code">
                  ${icon('copy')}
                </button>
              </div>
              <p>
                Use your recovery code if you forget your password. We don’t send password reset
                emails. Keep it private.
              </p>`
          : ''
      }
      <div class="notice">
        ${icon('shield')}<span
          >Your ImageAPI key authenticates requests. Add your own AI provider key in Settings to
          generate images.</span
        >
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-download>${icon('download')} Save credentials</button
        ><button class="btn btn-primary" data-close-modal>I’ve saved them ${icon('check')}</button>
      </div>`,
    {
      locked: true,
      onMount(root) {
        root.querySelector('[data-copy="api"]')?.addEventListener('click', () => copy(api_key));
        root
          .querySelector('[data-copy="recovery"]')
          ?.addEventListener('click', () => copy(recovery_code));
        root.querySelector('[data-download]').addEventListener('click', () => {
          const url = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = 'imageapi-credentials.txt';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
      },
    },
  );
}
