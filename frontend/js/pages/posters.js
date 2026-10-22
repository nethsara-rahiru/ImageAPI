import { api } from '../core/api.js';
import { escape, date } from '../core/html.js';
import { formError, clearError } from '../core/forms.js';
import { workspaceLayout, pageHeading, bindWorkspace } from '../components/workspace-layout.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
const sample = {
  prompt:
    'A serene architectural greenhouse on a floating botanical island above a pale blue sea, golden sunrise, cinematic editorial photography',
  headline: 'BOTANICAL FUTURES',
  subtitle: 'An exhibition of nature, architecture, and possibility.',
  details: '16 NOVEMBER · 10 AM–6 PM\nTHE GLASSHOUSE GALLERY',
  cta: 'DISCOVER THE EXHIBITION',
  eyebrow: 'A NEW PERSPECTIVE',
};
const options = (items, selected) =>
  items
    .map(
      ([value, label]) =>
        `<option value="${escape(value)}" ${value === selected ? 'selected' : ''}>${escape(label)}</option>`,
    )
    .join('');
export async function render() {
  const [{ providers }, { brands }, catalog, initial] = await Promise.all([
    api('/api/providers'),
    api('/v1/brands'),
    api('/v1/posters/catalog'),
    api('/v1/posters'),
  ]);
  const preferred = providers.find((p) => p.connected)?.id || 'cloudflare';
  let disposed = false,
    timer = null,
    current = null,
    lastPreview = '';
  return {
    html: workspaceLayout(
      `${pageHeading('From idea to finished poster.', 'Exact words. Considered typography. Your artwork, automatically composed.', '<a href="/brands" data-link class="btn btn-secondary">' + icon('layers') + ' Brand profiles</a>')}
      <div class="poster-studio"><section class="card poster-controls"><div class="card-head"><div><h3>Make something worth sharing.</h3><p class="small muted">Artwork is generated. Your words are typeset precisely.</p></div>${icon('sparkles')}</div>
      <form id="poster-form" class="card-body"><div class="field"><label for="poster-prompt">Artwork direction</label><textarea id="poster-prompt" name="prompt" maxlength="4000" required placeholder="Describe the subject, mood, lighting, and visual style. Leave the wording to the fields below."></textarea></div>
      <button type="button" class="text-link" data-poster-example>Start with an example ${icon('arrow')}</button>
      <div class="field"><label for="poster-headline">Exact headline</label><input id="poster-headline" name="headline" maxlength="160" required placeholder="Your main message" /></div>
      <div class="field"><label for="poster-subtitle">Subtitle</label><textarea id="poster-subtitle" name="subtitle" maxlength="260" placeholder="A little more context"></textarea></div>
      <div class="field"><label for="poster-details">Dates, place, and details</label><textarea id="poster-details" name="details" maxlength="604" placeholder="One detail per line · up to five lines"></textarea></div>
      <div class="field-row"><div class="field"><label for="poster-eyebrow">Small heading</label><input id="poster-eyebrow" name="eyebrow" maxlength="48" placeholder="Optional category or introduction" /></div><div class="field"><label for="poster-cta">Call to action</label><input id="poster-cta" name="cta" maxlength="48" placeholder="BOOK YOUR PLACE" /></div></div>
      <div class="field"><label for="poster-brand">Brand profile</label><select id="poster-brand" name="brand_id"><option value="">No saved brand</option>${options(brands.map((b) => [b.id, b.name]))}</select><small>Saved logo, colours, and typography are applied automatically. <a href="/brands" data-link>Manage brands</a>.</small></div>
      <div class="field-row"><div class="field"><label for="poster-layout">Design direction</label><select id="poster-layout" name="layout"><option value="auto">Choose automatically</option>${options(catalog.layouts.map((l) => [l.id, l.name]))}</select></div><div class="field"><label for="poster-size">Poster size</label><select id="poster-size" name="size">${options(
        Object.entries(catalog.sizes).map(([id, s]) => [id, s.label]),
        'portrait',
      )}</select></div></div>
      <div class="field-row"><div class="field"><label for="poster-provider">Artwork provider</label><select id="poster-provider" name="provider">${options(
        providers.map((p) => [
          p.id,
          p.name + (p.connected ? ' · Connected' : ' · Add key in Settings'),
        ]),
        preferred,
      )}</select></div><div class="field"><label for="poster-model">Artwork model</label><select id="poster-model" name="model"></select></div></div>
      <div class="field-row"><div class="field"><label for="poster-format">Preferred export</label><select id="poster-format" name="format">${options(catalog.formats.map((f) => [f, f.toUpperCase()]))}</select></div><div class="field"><label for="poster-retention">Keep output for</label><select id="poster-retention" name="retention_hours"><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option></select></div></div>
      <div id="poster-provider-note" class="notice small"></div>
      <button class="btn btn-primary btn-block" type="submit" id="create-poster">${icon('sparkles')} Create finished poster</button><p class="small muted">Your provider’s allowance applies. Jobs keep running if you leave. We check text fit and contrast; artwork still needs your review before publishing.</p></form></section>
      <section class="card poster-preview-card"><div class="card-head"><h3>Your finished poster</h3><span id="poster-state" class="badge badge-blue">READY FOR AN IDEA</span></div><div id="poster-preview" class="poster-preview"><div class="poster-empty">${icon('image')}<h2>Let the design come together.</h2><p>Tell us the artwork and the exact words.<br>We’ll take care of hierarchy, spacing, and legibility.</p><div class="poster-empty-demo"><span>YOUR NEXT</span><strong>BIG<br>IDEA.</strong><span>ARTWORK + PRECISE TYPOGRAPHY</span></div></div></div><div id="poster-downloads" class="card-body"></div><div id="poster-quality" class="card-body small muted"></div></section></div>
      <section class="card poster-jobs"><div class="card-head"><div><h3>Your poster library</h3><p class="small muted">PNG, JPEG, and WebP included. Links last 15 minutes; refresh them before sharing.</p></div><button class="btn btn-secondary btn-sm" data-refresh-posters>Refresh library</button></div><div id="poster-job-list"></div></section>`,
      '/posters',
    ),
    mount() {
      bindWorkspace();
      const form = document.querySelector('#poster-form'),
        provider = form.elements.provider,
        model = form.elements.model,
        button = document.querySelector('#create-poster');
      const status = document.querySelector('#poster-state'),
        preview = document.querySelector('#poster-preview'),
        downloads = document.querySelector('#poster-downloads'),
        quality = document.querySelector('#poster-quality');
      function updateProvider() {
        const p = providers.find((item) => item.id === provider.value);
        model.innerHTML = options(
          p.models.map((m) => [m, m]),
          p.default_model,
        );
        button.disabled = !p.connected;
        document.querySelector('#poster-provider-note').textContent = p.connected
          ? 'Connected. Exact text is composed separately from the generated artwork.'
          : 'Connect this provider in Settings before creating a poster.';
      }
      provider.addEventListener('change', updateProvider);
      updateProvider();
      form.querySelector('[data-poster-example]').addEventListener('click', () => {
        for (const [key, value] of Object.entries(sample)) form.elements[key].value = value;
        form.elements.layout.value = 'editorial';
      });
      function show(job) {
        current = job.id;
        status.textContent = job.stage.replaceAll('_', ' ').toUpperCase();
        if (job.status === 'completed' && job.result) {
          const result = job.result;
          if (lastPreview !== job.id) {
            preview.innerHTML = '';
            const image = document.createElement('img');
            image.src = result.downloads.png.url;
            image.alt = job.input?.headline || 'Finished poster';
            preview.append(image);
            lastPreview = job.id;
          }
          downloads.innerHTML = `<div class="poster-export-row">${Object.entries(result.downloads)
            .map(
              ([format, file]) =>
                `<a class="btn ${format === result.preferred_format ? 'btn-primary' : 'btn-secondary'} btn-sm" href="${escape(file.url)}" download="${job.id}.${format}" target="_blank" rel="noopener">${icon('download')} ${format.toUpperCase()}</a>`,
            )
            .join(
              '',
            )}</div><p class="small muted">${result.width} × ${result.height} · ${escape(result.layout)} · ${escape(result.font)} typography</p>`;
          quality.innerHTML = `<span class="badge badge-green">READABILITY CHECKS PASSED</span><p>Exact copy preserved · No overlaps · Text fits · Contrast ${result.quality.checks.text_contrast}:1</p>${result.quality.warnings.map((w) => `<p>${escape(w)}</p>`).join('')}<details><summary>Composition details</summary><pre>${escape(JSON.stringify(result.quality, null, 2))}</pre></details>`;
        } else if (['queued', 'running'].includes(job.status)) {
          lastPreview = '';
          preview.innerHTML = `<div class="poster-progress" role="status"><span class="spinner"></span><h2>${job.status === 'queued' ? 'Your design is in the queue.' : 'Bringing your poster together.'}</h2><p>${escape(job.stage.replaceAll('_', ' '))}</p><small>You can leave this page. Processing continues on the server.</small></div>`;
          downloads.innerHTML = '';
          quality.innerHTML = '';
        } else {
          lastPreview = '';
          preview.innerHTML = `<div class="poster-progress"><h2>${job.status === 'expired' ? 'This poster has expired.' : job.status === 'deleted' ? 'Poster deleted.' : 'This design needs another try.'}</h2><p>${escape(job.error?.detail || 'Create a new poster using the form.')}</p></div>`;
          downloads.innerHTML = '';
          quality.innerHTML = '';
        }
      }
      function library(jobs) {
        const box = document.querySelector('#poster-job-list');
        box.innerHTML = jobs.length
          ? `<div class="table-scroll"><table><thead><tr><th>Poster</th><th>Status</th><th>Created / expires</th><th>Actions</th></tr></thead><tbody>${jobs.map((job) => `<tr><td><strong>${escape(job.input?.headline || job.id)}</strong><div class="small muted">${escape(job.input?.size || '')} · ${escape(job.input?.provider || '')}</div></td><td><span class="badge ${job.status === 'completed' ? 'badge-green' : job.status === 'failed' ? 'badge-red' : ''}">${escape(job.status)}</span></td><td>${date(job.created_at)}<div class="small muted">Expires ${date(job.expires_at)}</div></td><td><div class="poster-row-actions"><button class="btn btn-ghost btn-sm" data-view-poster="${job.id}">View</button>${job.input ? `<button class="btn btn-ghost btn-sm" data-copy-poster="${job.id}">Use content</button>` : ''}${job.status !== 'running' && job.status !== 'deleted' ? `<button class="btn btn-ghost btn-sm" data-delete-poster="${job.id}">${job.status === 'queued' ? 'Cancel' : 'Delete'}</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="card-body muted">Your finished designs and active jobs will appear here.</div>';
        box
          .querySelectorAll('[data-view-poster]')
          .forEach((b) =>
            b.addEventListener('click', () =>
              show(jobs.find((j) => j.id === b.dataset.viewPoster)),
            ),
          );
        box.querySelectorAll('[data-copy-poster]').forEach((b) =>
          b.addEventListener('click', () => {
            const input = jobs.find((j) => j.id === b.dataset.copyPoster).input;
            for (const [key, value] of Object.entries(input)) {
              if (form.elements[key])
                form.elements[key].value = Array.isArray(value) ? value.join('\n') : value;
            }
            updateProvider();
            form.elements.model.value = input.model;
            toast('Content copied. Creating again uses a new provider request.');
            form.scrollIntoView({ behavior: 'smooth' });
          }),
        );
        box.querySelectorAll('[data-delete-poster]').forEach((b) =>
          b.addEventListener('click', async () => {
            try {
              await api('/v1/posters/' + b.dataset.deletePoster, { method: 'DELETE' });
              await refresh();
              toast('Poster removed. Download links revoked.');
            } catch (error) {
              toast(error.message, 'error');
            }
          }),
        );
      }
      async function refresh() {
        if (disposed) return;
        try {
          const { jobs } = await api('/v1/posters');
          if (disposed) return;
          library(jobs);
          const selected =
            jobs.find((j) => j.id === current) ||
            jobs.find((j) => j.status === 'running' || j.status === 'queued') ||
            jobs[0];
          if (selected) show(selected);
        } catch (error) {
          if (!disposed) toast(error.message, 'error');
        }
      }
      document.querySelector('[data-refresh-posters]').addEventListener('click', refresh);
      library(initial.jobs);
      if (initial.jobs.length) show(initial.jobs[0]);
      timer = setInterval(refresh, 5000);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearError(form);
        button.disabled = true;
        const body = Object.fromEntries(new FormData(form));
        body.details = body.details
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        body.retention_hours = Number(body.retention_hours);
        if (!body.brand_id) delete body.brand_id;
        try {
          const job = await api('/v1/posters', {
            method: 'POST',
            body,
            idempotencyKey: crypto.randomUUID(),
          });
          show(job);
          await refresh();
          toast('Poster queued. You can leave this page while it finishes.');
        } catch (error) {
          formError(form, error);
        } finally {
          button.disabled = !providers.find((p) => p.id === provider.value).connected;
        }
      });
    },
    unmount() {
      disposed = true;
      clearInterval(timer);
    },
  };
}
