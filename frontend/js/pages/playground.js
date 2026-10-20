import { api } from '../core/api.js';
import { escape } from '../core/html.js';
import { clearError, formError } from '../core/forms.js';
import { workspaceLayout, pageHeading, bindWorkspace } from '../components/workspace-layout.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
const prompts = [
  'A small glass greenhouse floating above a pastel sea, soft sunrise, editorial photography, no text',
  'A sculptural cream-colored staircase in a sunlit courtyard, pale blue sky, minimal architecture',
  'A ceramic vase with a single orange branch, mint-green backdrop, warm studio lighting, still life',
];
export function playgroundView(providers) {
  const first = providers.find((p) => p.connected) || providers[0];
  return /* HTML */ `<div class="playground-layout">
      <section class="card playground-form">
        <div class="card-head">
          <h3>${icon('sparkles')} Shape your idea</h3>
          <span class="badge badge-blue">PLAYGROUND</span>
        </div>
        <form id="generation-form" class="card-body">
          <div class="field">
            <label for="prompt">Your prompt</label
            ><textarea
              id="prompt"
              name="prompt"
              placeholder="A little surreal. A little unexpected. What would you like to see?"
              required
              maxlength="12000"
            ></textarea>
          </div>
          <div class="prompt-footer">
            <button type="button" data-inspiration>${icon('sparkles')} Try an idea</button
            ><span id="prompt-count">0 / 12,000</span>
          </div>
          <div class="field">
            <label for="provider">Provider</label
            ><select id="provider" name="provider">
              ${providers.map((provider) => /* HTML */ `<option value="${provider.id}" ${provider.id === first.id ? 'selected' : ''}>${escape(provider.name)}${provider.connected ? ' · Connected' : ''}</option>`).join('')}
            </select>
          </div>
          <div class="provider-inline-status" id="provider-status"></div>
          <div class="field">
            <label for="model">Model</label
            ><select id="model" name="model"></select>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="size">Canvas size</label
              ><select id="size" name="size"></select>
            </div>
            <div class="field">
              <label for="quality">Quality</label
              ><select id="quality" name="quality"></select>
            </div>
          </div>
          <button class="btn btn-primary btn-block" id="generate-button" type="submit">
            ${icon('sparkles')} Generate image
          </button>
          <p class="small muted playground-note">
            One image per request. Your provider’s generation charges apply. Images aren’t saved
            here—download the ones you love.
          </p>
        </form>
      </section>
      <section class="card playground-output" aria-label="Generation result">
        <div class="output-head">
          <span>Your canvas</span><span class="badge" id="output-status">READY FOR AN IDEA</span>
        </div>
        <div class="output-canvas" id="output-canvas">
          <div class="output-placeholder">
            <div class="output-art">${icon('image')}</div>
            <h3>Let’s make something.</h3>
            <p>
              Your next image is just a prompt away. Pick a provider, find the words, and see what
              takes shape.
            </p>
            <p class="small">YOUR IMAGINATION GOES HERE.</p>
          </div>
        </div>
        <div class="output-meta" id="output-meta">
          <span>Generated images appear here.</span
          ><a class="text-link" href="/docs#generate" data-link
            >Build this into your app ${icon('arrow')}</a
          >
        </div>
      </section>
    </div>
    <div class="notice playground-note">
      ${icon('shield')}<span
        >Uses your saved provider key. API and playground requests share your monthly allowance. For
        Gemini, canvas sizes specify aspect ratio; actual pixels depend on the model.</span
      >
    </div>`;
}
export function bindPlayground(providers) {
  const form = document.querySelector('#generation-form'),
    providerSelect = form.querySelector('#provider'),
    model = form.querySelector('#model'),
    size = form.querySelector('#size'),
    quality = form.querySelector('#quality'),
    prompt = form.querySelector('#prompt'),
    button = form.querySelector('#generate-button'),
    status = document.querySelector('#provider-status'),
    canvas = document.querySelector('#output-canvas'),
    outputStatus = document.querySelector('#output-status'),
    meta = document.querySelector('#output-meta');
  let busy = false,
    blobUrl = null,
    disposed = false,
    idea = 0;
  const update = () => {
    const provider = providers.find((p) => p.id === providerSelect.value);
    prompt.maxLength = provider.prompt_limit || 12000;
    document.querySelector('#prompt-count').textContent =
      `${prompt.value.length.toLocaleString()} / ${prompt.maxLength.toLocaleString()}`;
    model.innerHTML = provider.models
      .map(
        (value) =>
          /* HTML */ `<option
            value="${escape(value)}"
            ${value === provider.default_model ? 'selected' : ''}
          >
            ${escape(value)}
          </option>`,
      )
      .join('');
    size.innerHTML = provider.sizes
      .map(
        (value) =>
          /* HTML */ `<option value="${value}">
            ${value.replace('x', ' × ')}${value === '1024x1024' ? ' · Square' : value === '1536x1024' ? ' · Landscape' : ' · Portrait'}
          </option>`,
      )
      .join('');
    quality.innerHTML = provider.qualities
      .map(
        (value) =>
          /* HTML */ `<option value="${value}">${value[0].toUpperCase() + value.slice(1)}</option>`,
      )
      .join('');
    quality.disabled = provider.qualities.length === 1;
    status.classList.toggle('ready', provider.connected);
    status.innerHTML = provider.connected
      ? `${icon('check')} Key saved · verified when you generate${provider.size_note ? ' · ' + escape(provider.size_note) : ''}`
      : `${icon('info')} <a class="text-link" href="/settings" data-link>Add your ${escape(provider.name)} key in Settings</a>`;
    button.disabled = !provider.connected || busy;
  };
  providerSelect.addEventListener('change', update);
  update();
  prompt.addEventListener('input', () => {
    document.querySelector('#prompt-count').textContent =
      `${prompt.value.length.toLocaleString()} / ${prompt.maxLength.toLocaleString()}`;
  });
  form.querySelector('[data-inspiration]').addEventListener('click', () => {
    prompt.value = prompts[idea++ % prompts.length];
    prompt.dispatchEvent(new Event('input'));
    prompt.focus();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const selected = providers.find((p) => p.id === providerSelect.value);
    if (!selected.connected) {
      formError(form, new Error('Connect this provider in Settings first.'));
      return;
    }
    if (!prompt.value.trim()) {
      formError(form, new Error('Tell us what you’d like to create.'));
      return;
    }
    const body = {
      prompt: prompt.value.trim(),
      provider: providerSelect.value,
      model: model.value,
      size: size.value,
      quality: quality.value,
    };
    clearError(form);
    busy = true;
    const start = performance.now();
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span> Creating your image…';
    outputStatus.textContent = 'CREATING';
    const loading = document.createElement('div');
    loading.className = 'generation-loading';
    loading.setAttribute('role', 'status');
    loading.innerHTML =
      '<span class="spinner" aria-hidden="true"></span><strong>A little imagination at work.</strong><p>This can take a few minutes. Keep this page open; leaving won’t cancel a provider charge.</p>';
    canvas.append(loading);
    providerSelect.disabled = true;
    try {
      const result = await api('/v1/images/generations', { method: 'POST', body });
      if (disposed) return;
      const item = result.data[0];
      const bytes = Uint8Array.from(atob(item.b64_json), (c) => c.charCodeAt(0));
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(new Blob([bytes], { type: item.mime_type }));
      canvas.innerHTML = '';
      const image = document.createElement('img');
      image.className = 'generated-image';
      image.src = blobUrl;
      image.alt = body.prompt;
      canvas.append(image);
      outputStatus.textContent = 'READY TO KEEP';
      outputStatus.className = 'badge badge-green';
      meta.innerHTML = /* HTML */ `<div>
          <span>${item.width} × ${item.height}</span
          ><span>${((performance.now() - start) / 1000).toFixed(1)}s</span
          ><code>${escape(result.id)}</code>
        </div>
        <a
          class="btn btn-secondary btn-sm"
          download="imageapi-${escape(result.id)}.png"
          href="${blobUrl}"
          >${icon('download')} Download PNG</a
        >`;
      toast('Your image is ready. Download it to keep it.');
    } catch (error) {
      if (!disposed) {
        formError(
          form,
          new Error(error.message + (error.requestId ? ` · ${error.requestId}` : '')),
        );
        outputStatus.textContent = 'TRY ANOTHER IDEA';
        outputStatus.className = 'badge';
      }
    } finally {
      busy = false;
      loading.remove();
      if (!disposed) {
        providerSelect.disabled = false;
        button.innerHTML = `${icon('sparkles')} Generate image`;
        update();
      }
    }
  });
  return () => {
    disposed = true;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  };
}
export async function render() {
  const { providers } = await api('/api/providers');
  let cleanup;
  return {
    html: workspaceLayout(
      `${pageHeading('A space to experiment.', 'Find the words. Pick a model. See what happens.', '<a class="btn btn-secondary" href="/api" data-link>' + icon('code') + ' API keys & quickstart</a>')}${playgroundView(providers)}`,
      '/playground',
    ),
    mount() {
      bindWorkspace();
      cleanup = bindPlayground(providers);
    },
    unmount() {
      cleanup?.();
    },
  };
}
