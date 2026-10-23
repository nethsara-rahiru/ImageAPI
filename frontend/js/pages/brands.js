import { api } from '../core/api.js';
import { escape } from '../core/html.js';
import { submitting } from '../core/forms.js';
import { workspaceLayout, pageHeading, bindWorkspace } from '../components/workspace-layout.js';
import { icon } from '../components/icons.js';
import { navigate } from '../core/router.js';
import { toast } from '../components/toast.js';
export async function render() {
  const { brands } = await api('/v1/brands');
  let editing = null;
  return {
    html: workspaceLayout(
      `${pageHeading('A recognisable point of view.', 'Save your identity once. Every poster starts with your brand.', '<a href="/posters" data-link class="btn btn-primary">' + icon('sparkles') + ' Create a poster</a>')}<div class="brand-layout"><section class="card"><div class="card-head"><h3 id="brand-form-title">New brand profile</h3><span class="badge">UP TO 10 BRANDS</span></div><form id="brand-form" class="card-body"><div class="field"><label for="brand-name">Brand name</label><input id="brand-name" name="name" maxlength="60" required /></div><div class="field"><label for="brand-tagline">Brand tagline</label><input id="brand-tagline" name="tagline" maxlength="120" /></div><div class="field-row"><div class="field"><label for="brand-accent">Accent colour</label><input type="color" id="brand-accent" name="accent_color" value="#2563eb" /></div><div class="field"><label for="brand-background">Paper colour</label><input type="color" id="brand-background" name="background_color" value="#f7f3eb" /></div></div><div class="field"><label for="brand-font">Typography</label><select id="brand-font" name="font"><option value="sans">Sans · clean and versatile</option><option value="display">Display · bold and condensed</option><option value="serif">Serif · editorial and expressive</option></select><small>Latin, Greek, Cyrillic, Arabic, Sinhala, and Tamil characters use bundled fonts. Emoji are not supported.</small></div><div class="field"><label for="brand-logo">Logo file</label><input type="file" id="brand-logo" accept="image/png,image/jpeg,image/webp" /><small>PNG with transparency recommended. PNG/JPEG/WebP, up to 550 KB. Replacing a profile preserves the existing logo unless you remove it.</small></div><label class="brand-remove"><input type="checkbox" id="remove-logo" /> Remove existing logo</label><button class="btn btn-primary" type="submit">Save brand profile ${icon('check')}</button><button class="btn btn-ghost" type="button" data-reset-brand>Start a new profile</button></form></section><section class="brand-cards">${brands.length ? brands.map((brand) => `<article class="card brand-card"><div class="card-body">${brand.logo ? `<img class="brand-logo-preview" src="data:image/png;base64,${escape(brand.logo)}" alt="${escape(brand.name)} logo" />` : `<div class="brand-avatar">${icon('layers')}</div>`}<h2>${escape(brand.name)}</h2><p>${escape(brand.tagline || 'Your visual identity, ready to use.')}</p><p class="small muted">${escape(brand.font)} · ${escape(brand.accent_color)} · ${escape(brand.background_color)}</p><div class="poster-row-actions"><button class="btn btn-secondary btn-sm" data-edit-brand="${brand.id}">Edit profile</button><button class="btn btn-ghost btn-sm" data-delete-brand="${brand.id}">Delete</button></div></div></article>`).join('') : '<div class="card card-body"><h3>Your brand belongs here.</h3><p>Save your logo, colours, and type style. Poster jobs take a snapshot, so later profile changes won’t alter existing designs.</p></div>'}</section></div>`,
      '/brands',
    ),
    mount() {
      bindWorkspace();
      const form = document.querySelector('#brand-form');
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitting(form, async () => {
          const body = Object.fromEntries(new FormData(form)),
            file = document.querySelector('#brand-logo').files[0];
          if (file) {
            if (file.size > 550000) throw new Error('Choose a logo smaller than 550 KB.');
            const bytes = new Uint8Array(await file.arrayBuffer());
            let raw = '';
            for (const byte of bytes) raw += String.fromCharCode(byte);
            body.logo = btoa(raw);
          } else if (editing?.logo && !document.querySelector('#remove-logo').checked)
            body.logo = editing.logo;
          await api('/v1/brands' + (editing ? '/' + editing.id : ''), {
            method: editing ? 'PUT' : 'POST',
            body,
          });
          toast('Brand profile saved');
          navigate('/brands', { replace: true });
        });
      });
      document.querySelector('[data-reset-brand]').addEventListener('click', () => {
        editing = null;
        form.reset();
        document.querySelector('#brand-form-title').textContent = 'New brand profile';
      });
      document.querySelectorAll('[data-edit-brand]').forEach((button) =>
        button.addEventListener('click', () => {
          editing = brands.find((b) => b.id === button.dataset.editBrand);
          for (const field of ['name', 'tagline', 'accent_color', 'background_color', 'font'])
            form.elements[field].value = editing[field];
          document.querySelector('#brand-form-title').textContent = 'Edit ' + editing.name;
          form.scrollIntoView({ behavior: 'smooth' });
        }),
      );
      document.querySelectorAll('[data-delete-brand]').forEach((button) =>
        button.addEventListener('click', async () => {
          try {
            await api('/v1/brands/' + button.dataset.deleteBrand, { method: 'DELETE' });
            toast('Brand removed. Existing posters keep their original design.');
            navigate('/brands', { replace: true });
          } catch (error) {
            toast(error.message, 'error');
          }
        }),
      );
    },
  };
}
