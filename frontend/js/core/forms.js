import { escape } from './html.js';
export function formError(form, error) {
  let box = form.querySelector('[data-form-error]');
  if (!box) {
    box = document.createElement('div');
    box.dataset.formError = '';
    box.className = 'form-error';
    box.setAttribute('role', 'alert');
    form.prepend(box);
  }
  box.hidden = false;
  box.textContent = error.message || String(error);
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
export function clearError(form) {
  const box = form.querySelector('[data-form-error]');
  if (box) box.hidden = true;
}
export async function submitting(form, callback) {
  clearError(form);
  const button = form.querySelector('[type="submit"]');
  const previous = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="spinner" aria-hidden="true"></span> Please wait…';
  try {
    return await callback();
  } catch (error) {
    formError(form, error);
  } finally {
    button.disabled = false;
    button.innerHTML = previous;
  }
}
export function passwordField(id, label, autocomplete = 'current-password', min = 1) {
  return /* HTML */ `<div class="field">
    <label for="${id}">${escape(label)}</label>
    <div class="password-wrap">
      <input
        id="${id}"
        name="${id}"
        type="password"
        required
        minlength="${min}"
        maxlength="128"
        autocomplete="${autocomplete}"
        ${min === 12 ? 'placeholder="At least 12 characters"' : ''}
      /><button
        class="password-toggle"
        type="button"
        data-toggle-password="${id}"
        aria-label="Show password"
      >
        <svg class="icon" viewBox="0 0 24 24">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </div>
  </div>`;
}
export function bindPasswordToggles(root) {
  root.querySelectorAll('[data-toggle-password]').forEach((button) =>
    button.addEventListener('click', () => {
      const input = root.querySelector(`#${button.dataset.togglePassword}`);
      input.type = input.type === 'password' ? 'text' : 'password';
      button.setAttribute(
        'aria-label',
        input.type === 'password' ? 'Show password' : 'Hide password',
      );
    }),
  );
}
