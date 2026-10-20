import { api } from '../core/api.js';
import { escape, date } from '../core/html.js';
import { state, setSession } from '../core/state.js';
import { navigate } from '../core/router.js';
import { submitting, passwordField, bindPasswordToggles } from '../core/forms.js';
import { workspaceLayout, pageHeading, bindWorkspace } from '../components/workspace-layout.js';
import { icon } from '../components/icons.js';
import { modal } from '../components/modal.js';
import { toast } from '../components/toast.js';
export async function render() {
  const { providers } = await api('/api/providers');
  return {
    html: workspaceLayout(
      `${pageHeading('Make yourself at home.', 'Connect your providers and take care of your account.')}<div class="settings-grid"><section class="card"><div class="card-head"><div><h3>AI provider connections</h3><p class="chart-subtitle">Your keys power the playground and your API requests.</p></div>${icon('key')}</div>${providers
        .map(
          (provider) =>
            /* HTML */ `<form class="provider-settings" data-provider="${provider.id}">
              <div class="provider-settings-head">
                <div class="provider-icon ${provider.id}">${icon(provider.id)}</div>
                <div>
                  <h3>${escape(provider.name)}</h3>
                  <p>${escape(provider.description)}</p>
                </div>
                <span class="badge ${provider.connected ? 'badge-green' : ''}"
                  >${provider.connected ? 'KEY SAVED' : 'NOT CONNECTED'}</span
                >
              </div>
              <div class="field">
                <label for="key-${provider.id}"
                  >${provider.connected ? 'Replace' : 'Add'} provider API key</label
                ><input
                  id="key-${provider.id}"
                  name="api_key"
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="${provider.connected ? 'Saved key: ' + escape(provider.hint) : 'Paste your ' + escape(provider.name) + ' API key'}"
                  minlength="8"
                  maxlength="512"
                  required
                /><small>Encrypted at rest. Full keys are never returned to your browser.</small>
              </div>
              <div class="provider-settings-actions">
                <a
                  class="text-link"
                  href="${escape(provider.key_url)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Get a provider key ${icon('external')}</a
                >
                <div>
                  ${provider.connected ? /* HTML */ `<button type="button" class="btn btn-ghost btn-sm" data-disconnect="${provider.id}">Disconnect</button>` : ''}<button
                    type="submit"
                    class="btn btn-primary btn-sm"
                  >
                    ${provider.connected ? 'Replace key' : 'Save key'} ${icon('check')}
                  </button>
                </div>
              </div>
              ${provider.connected ? /* HTML */ `<p class="provider-hint">Saved ${date(provider.updated_at)} · Verified when you generate an image.</p>` : ''}
            </form>`,
        )
        .join(
          '',
        )}</section><div class="settings-stack"><section class="card"><div class="card-head"><h3>Your account</h3>${icon('grid')}</div><div class="card-body"><div class="account-detail"><span>Name</span><strong>${escape(state.user.name)}</strong></div><div class="account-detail"><span>Email</span><strong>${escape(state.user.email)}</strong></div><div class="account-detail"><span>Joined</span><strong>${date(state.user.created_at, { year: 'numeric' })}</strong></div><div class="account-detail"><span>Current plan</span><span class="badge badge-blue">FREE · 100 IMAGES / MONTH</span></div><a class="btn btn-secondary btn-sm btn-block" href="/pricing" data-link>Explore the plans ${icon('arrow')}</a></div></section><section class="card"><div class="card-head"><h3>Password & security</h3>${icon('shield')}</div><form id="password-form" class="card-body">${passwordField('current_password', 'Current password')}${passwordField('new_password', 'New password', 'new-password', 12)}<p class="small muted security-note">Changing your password signs out all sessions. Your ImageAPI keys keep working.</p><button type="submit" class="btn btn-secondary btn-sm btn-block">Update password ${icon('arrow')}</button></form></section><div class="notice">${icon('lock')}<span>Keep your recovery code in a password manager. Password recovery revokes all sessions and ImageAPI keys. We never email recovery codes.</span></div><section class="card danger-card"><div class="card-head"><h3>Delete account</h3></div><div class="card-body"><p>Permanently remove your account, saved provider credentials, ImageAPI keys, and usage history.</p><button class="btn btn-danger btn-sm" data-delete-account>Delete my account</button></div></section></div></div>`,
      '/settings',
    ),
    mount() {
      bindWorkspace();
      bindPasswordToggles(document);
      document.querySelectorAll('[data-provider]').forEach((form) =>
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          submitting(form, async () => {
            await api(`/api/providers/${form.dataset.provider}`, {
              method: 'PUT',
              body: { api_key: form.querySelector('input').value.trim() },
            });
            form.querySelector('input').value = '';
            toast('Provider key saved securely');
            navigate('/settings', { replace: true });
          });
        }),
      );
      document.querySelectorAll('[data-disconnect]').forEach((button) =>
        button.addEventListener('click', () => {
          const provider = providers.find((p) => p.id === button.dataset.disconnect);
          modal(
            `Disconnect ${provider.name}?`,
            /* HTML */ `<p>
                New playground and API requests for this provider will stop until you add a key
                again.
              </p>
              <form>
                <div class="modal-actions">
                  <button type="button" class="btn btn-secondary" data-close-modal>
                    Keep connected</button
                  ><button type="submit" class="btn btn-danger">Disconnect</button>
                </div>
              </form>`,
            {
              onMount(root, close) {
                const form = root.querySelector('form');
                form.addEventListener('submit', (event) => {
                  event.preventDefault();
                  submitting(form, async () => {
                    await api(`/api/providers/${provider.id}`, { method: 'DELETE' });
                    close();
                    toast('Provider disconnected');
                    navigate('/settings', { replace: true });
                  });
                });
              },
            },
          );
        }),
      );
      const password = document.querySelector('#password-form');
      password.addEventListener('submit', (event) => {
        event.preventDefault();
        submitting(password, async () => {
          await api('/api/auth/password', {
            method: 'POST',
            body: Object.fromEntries(new FormData(password)),
          });
          setSession(null);
          navigate('/login', { replace: true });
          toast('Password updated. Please sign in again.');
        });
      });
      document.querySelector('[data-delete-account]').addEventListener('click', () =>
        modal(
          'Delete your workspace?',
          /* HTML */ `<p>
              This permanently deletes your account and all of its data. Enter your password to
              confirm.
            </p>
            <form>
              ${passwordField('delete_password', 'Password')}
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" data-close-modal>
                  Keep my account</button
                ><button type="submit" class="btn btn-danger">Delete permanently</button>
              </div>
            </form>`,
          {
            onMount(root, close) {
              bindPasswordToggles(root);
              const form = root.querySelector('form');
              form.addEventListener('submit', (event) => {
                event.preventDefault();
                submitting(form, async () => {
                  await api('/api/auth/account', {
                    method: 'DELETE',
                    body: { password: form.querySelector('input').value },
                  });
                  close();
                  setSession(null);
                  navigate('/', { replace: true });
                  toast('Your account has been deleted');
                });
              });
            },
          },
        ),
      );
    },
  };
}
