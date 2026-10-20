import { api } from '../core/api.js';
import { state, setSession } from '../core/state.js';
import { navigate } from '../core/router.js';
import { escape } from '../core/html.js';
import { submitting, passwordField, bindPasswordToggles } from '../core/forms.js';
import { brand, icon } from '../components/icons.js';
import { toast, copy } from '../components/toast.js';
const intro = {
  login: ['Welcome back.', 'Your next idea is right where you left it.'],
  signup: [
    'A little idea. A new beginning.',
    'Create your workspace and give your imagination somewhere to go.',
  ],
  recover: [
    'Let’s get you back in.',
    'Use the recovery code you saved when creating your account.',
  ],
};
export async function render(mode) {
  const signup = mode === 'signup',
    recover = mode === 'recover';
  const [title, subtitle] = intro[mode];
  return {
    html: /* HTML */ `<div class="auth-layout">
      <aside class="auth-visual">
        <img
          class="auth-visual-art"
          src="/static/assets/dreamscape.svg"
          alt="Pastel dreamscape of a floating moon over dunes"
        />${brand()}
        <div class="auth-visual-content">
          <h2>Some ideas deserve<br />to be seen.</h2>
          <p>
            Your providers. Your prompts. One little workspace for all the things you haven’t made
            yet.
          </p>
          <div class="auth-visual-label">${icon('sparkles')} IMAGINATION, WITH AN API.</div>
        </div>
      </aside>
      <main id="main" class="auth-panel page-enter">
        ${brand()}<a class="auth-back" href="/" data-link>${icon('back')} Back to ImageAPI</a>
        <h1>${title}</h1>
        <p class="auth-intro">${subtitle}</p>
        <form id="auth-form">
          ${signup ? '<div class="field"><label for="name">Your name</label><input id="name" name="name" placeholder="Alex Morgan" autocomplete="name" required maxlength="80"></div>' : ''}
          <div class="field">
            <label for="email">Email address</label
            ><input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autocomplete="email"
              required
              maxlength="254"
            />
          </div>
          ${recover ? '<div class="field"><label for="recovery_code">Recovery code</label><input id="recovery_code" name="recovery_code" type="password" placeholder="iar_…" autocomplete="off" required minlength="20" maxlength="200"><small>Recovery codes are shown once at account creation. There is no email reset.</small></div>' : ''}${passwordField('password', recover ? 'New password' : 'Password', signup || recover ? 'new-password' : 'current-password', signup || recover ? 12 : 1)}${mode === 'login' ? '<div class="auth-links"><a class="text-link" href="/recover" data-link>Forgot your password?</a></div>' : ''}<button
            class="btn btn-primary btn-block auth-submit"
            type="submit"
          >
            ${signup ? 'Create your workspace' : recover ? 'Reset password' : 'Log in to your workspace'}
            ${icon('arrow')}
          </button>
        </form>
        <div class="auth-switch">
          ${signup ? 'Already have an account? <a class="text-link" href="/login" data-link>Log in</a>' : recover ? 'Remember your password? <a class="text-link" href="/login" data-link>Log in</a>' : 'New to ImageAPI? <a class="text-link" href="/signup" data-link>Create an account</a>'}
        </div>
        <p class="auth-terms">
          ${icon('shield')}
          ${signup ? 'Free to start. Provider usage is billed by your provider.' : 'Your provider keys stay encrypted in your workspace.'}
        </p>
        <div class="auth-mobile-footer">A little imagination. A lot of possibility.</div>
      </main>
    </div>`,
    mount() {
      bindPasswordToggles(document);
      const form = document.querySelector('#auth-form');
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitting(form, async () => {
          const fields = Object.fromEntries(new FormData(form));
          const data = await api(
            `/api/auth/${recover ? 'recover' : signup ? 'register' : 'login'}`,
            { method: 'POST', body: fields },
          );
          if (recover) {
            setSession(null);
            form.innerHTML = /* HTML */ `<div class="recovery-success">
              <h3>Your password is reset.</h3>
              <p>${escape(data.message)}</p>
              <label class="field-label">Save your replacement recovery code</label>
              <div class="secret-box">
                <code>${escape(data.recovery_code)}</code
                ><button
                  type="button"
                  class="btn btn-icon"
                  data-copy-recovery
                  aria-label="Copy recovery code"
                >
                  ${icon('copy')}
                </button>
              </div>
              <a href="/login" data-link class="btn btn-primary btn-block"
                >Back to login ${icon('arrow')}</a
              >
            </div>`;
            form
              .querySelector('[data-copy-recovery]')
              .addEventListener('click', () => copy(data.recovery_code));
            return;
          }
          setSession(data);
          if (signup)
            state.pendingSecrets = { api_key: data.api_key, recovery_code: data.recovery_code };
          navigate('/dashboard', { replace: true });
          if (!signup) toast('Welcome back');
        });
      });
    },
  };
}
