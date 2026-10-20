import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { escape, date } from '../core/html.js';
import { submitting } from '../core/forms.js';
import { navigate } from '../core/router.js';
import { workspaceLayout, pageHeading, bindWorkspace } from '../components/workspace-layout.js';
import { modal, showSecrets } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { icon } from '../components/icons.js';
import { codePanel, bindCode, curlExample } from '../components/code.js';
import { playgroundView, bindPlayground } from './playground.js';
export async function render() {
  const [{ keys, limit }, { providers }] = await Promise.all([
    api('/api/keys'),
    api('/api/providers'),
  ]);
  const tab = new URLSearchParams(location.search).get('tab') || 'playground';
  let cleanup;
  const activeCount = keys.filter((key) => !key.revoked_at).length;
  return {
    html: workspaceLayout(
      `${pageHeading('Your ideas. Your API.', 'A key to your workspace, and a playground to put it to work.', /* HTML */ `<button class="btn btn-primary" data-create-key ${activeCount >= limit ? 'disabled' : ''}>${icon('plus')} Create API key</button>`)}<section class="card"><div class="card-head"><div><h3>ImageAPI keys <span class="badge">${activeCount} / ${limit} ACTIVE</span></h3><p class="chart-subtitle">Use these keys in your applications. Keep them on your server.</p></div>${icon('key')}</div>${
        keys.length
          ? /* HTML */ `<div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Key</th>
                    <th>Created</th>
                    <th>Last used</th>
                    <th>Status</th>
                    <th><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  ${keys
                    .map(
                      (key) =>
                        /* HTML */ `<tr>
                          <td>
                            <div class="key-cell">
                              ${icon('key')}<span class="table-primary">${escape(key.name)}</span>
                            </div>
                          </td>
                          <td><code>${escape(key.prefix)}</code></td>
                          <td>${date(key.created_at)}</td>
                          <td>${date(key.last_used_at)}</td>
                          <td>
                            <span class="badge ${key.revoked_at ? '' : 'badge-green'}"
                              >${key.revoked_at ? 'Revoked' : 'Active'}</span
                            >
                          </td>
                          <td>
                            <div class="table-actions">
                              ${key.revoked_at ? '' : /* HTML */ `<button class="btn btn-ghost btn-sm" data-revoke="${key.id}" aria-label="Revoke ${escape(key.name)}">${icon('trash')} Revoke</button>`}
                            </div>
                          </td>
                        </tr>`,
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
          : /* HTML */ `<div class="empty-state">
              <div class="empty-icon">${icon('key')}</div>
              <h3>A fresh key for your next project.</h3>
              <p>Create an ImageAPI key to authenticate requests from your applications.</p>
              <button class="btn btn-primary btn-sm" data-create-key>
                ${icon('plus')} Create API key
              </button>
            </div>`
      }</section><div class="notice playground-note">${icon('lock')}<span>ImageAPI keys and provider keys do different jobs. Authenticate with an ImageAPI key, then we use your saved AI provider key to generate. Full ImageAPI keys are shown only once.</span></div><div class="section-label api-section-label"><h2>Put your key to work.</h2><div class="segmented"><a class="${tab === 'playground' ? 'active' : ''}" href="/api?tab=playground" data-link>Playground</a><a class="${tab === 'quickstart' ? 'active' : ''}" href="/api?tab=quickstart" data-link>Quickstart</a></div></div>${
        tab === 'quickstart'
          ? /* HTML */ `<div class="card api-code">
                <div class="card-head">
                  <h3>Your first image request</h3>
                  <code>POST /v1/images/generations</code>
                </div>
                ${codePanel(curlExample())}
              </div>
              <div class="api-grid">
                <article class="card info-card">
                  <div class="feature-icon">${icon('book')}</div>
                  <div>
                    <h3>Build at your own pace.</h3>
                    <p>
                      Explore request options, provider models, response formats, and the errors
                      your application should handle.
                    </p>
                    <a class="text-link small" href="/docs" data-link
                      >Read the documentation ${icon('arrow')}</a
                    >
                  </div>
                </article>
                <article class="card info-card">
                  <div class="feature-icon">${icon('shield')}</div>
                  <div>
                    <h3>A little key care.</h3>
                    <p>
                      Use a separate key for each project. If a key is exposed, revoke it here and
                      create a replacement.
                    </p>
                    <a class="text-link small" href="/settings" data-link
                      >Manage your providers ${icon('arrow')}</a
                    >
                  </div>
                </article>
              </div>`
          : playgroundView(providers)
      }`,
      '/api',
    ),
    mount() {
      bindWorkspace();
      bindCode();
      if (tab !== 'quickstart') cleanup = bindPlayground(providers);
      document.querySelectorAll('[data-create-key]').forEach((button) =>
        button.addEventListener('click', () =>
          modal(
            'A key for your next project.',
            /* HTML */ `<p>
                Give it a name you’ll recognize later. You can have up to ${limit} active keys.
              </p>
              <form id="create-key-form">
                <div class="field">
                  <label for="key-name">Key name</label
                  ><input
                    id="key-name"
                    name="name"
                    placeholder="My weekend project"
                    required
                    maxlength="60"
                  />
                </div>
                <div class="modal-actions">
                  <button type="button" class="btn btn-secondary" data-close-modal>Cancel</button
                  ><button type="submit" class="btn btn-primary">Create key ${icon('plus')}</button>
                </div>
              </form>`,
            {
              onMount(root, close) {
                const form = root.querySelector('form');
                form.addEventListener('submit', (event) => {
                  event.preventDefault();
                  submitting(form, async () => {
                    const data = await api('/api/keys', {
                      method: 'POST',
                      body: { name: form.querySelector('input').value },
                    });
                    close();
                    state.pendingSecrets = { api_key: data.api_key };
                    navigate(location.pathname + location.search, { replace: true });
                  });
                });
              },
            },
          ),
        ),
      );
      document.querySelectorAll('[data-revoke]').forEach((button) =>
        button.addEventListener('click', () => {
          const key = keys.find((k) => k.id === button.dataset.revoke);
          modal(
            'Revoke this key?',
            /* HTML */ `<p>
                Requests using <strong>${escape(key.name)}</strong> will stop working immediately.
                This cannot be undone.
              </p>
              <form id="revoke-form">
                <div class="modal-actions">
                  <button type="button" class="btn btn-secondary" data-close-modal>Keep key</button
                  ><button type="submit" class="btn btn-danger">Revoke key</button>
                </div>
              </form>`,
            {
              onMount(root, close) {
                const form = root.querySelector('form');
                form.addEventListener('submit', (event) => {
                  event.preventDefault();
                  submitting(form, async () => {
                    await api(`/api/keys/${key.id}`, { method: 'DELETE' });
                    close();
                    toast('API key revoked');
                    navigate(location.pathname + location.search, { replace: true });
                  });
                });
              },
            },
          );
        }),
      );
    },
    unmount() {
      cleanup?.();
    },
  };
}
