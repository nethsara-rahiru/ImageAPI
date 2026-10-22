import { marketingLayout, bindMarketing } from '../components/marketing-layout.js';
import { icon } from '../components/icons.js';
import { codePanel, bindCode, curlExample } from '../components/code.js';
export async function render() {
  return {
    html: marketingLayout(
      /* HTML */ `<div class="container">
          <section class="hero">
            <div class="hero-content">
              <div class="eyebrow">The automated poster studio</div>
              <h1>Your next idea.<br />A finished <span>poster.</span></h1>
              <p>
                Generate artwork, typeset exact words, and apply your brand automatically. Get a
                finished poster from the studio or one ImageAPI key.
              </p>
              <div class="hero-actions">
                <a class="btn btn-primary btn-lg" href="/signup" data-link
                  >Start creating for free ${icon('arrow')}</a
                ><a class="btn btn-secondary btn-lg" href="/docs" data-link
                  >${icon('code')} Explore the API</a
                >
              </div>
              <div class="hero-footnote">
                ${icon('check')} No credit card. Your keys. Your possibilities.
              </div>
            </div>
            <div class="hero-gallery" aria-label="Creative inspiration artwork">
              <div class="art-card art-third">
                <img
                  src="/static/assets/botanical.svg"
                  alt="A leafy arrangement and oranges in a soft green still life"
                />
              </div>
              <div class="art-card art-main">
                <img
                  src="/static/assets/dreamscape.svg"
                  alt="A pink moon floating above warm dunes under a blue sky"
                />
                <div class="art-caption">${icon('sparkles')} A quiet world, a little surreal.</div>
              </div>
              <div class="art-card art-secondary">
                <img
                  src="/static/assets/architecture.svg"
                  alt="Sculptural arches and stairs in a sunlit courtyard"
                />
              </div>
              <div class="hero-float-tag">${icon('bolt')} One request. Endless directions.</div>
            </div>
          </section>
          <div class="provider-strip">
            <span>YOUR FAVORITE MODELS. ONE PLACE.</span>
            <div class="provider-wordmark">${icon('openai')} OpenAI</div>
            <div class="provider-wordmark">${icon('gemini', 'gemini-star')} Gemini</div>
            <div class="provider-wordmark">${icon('cloudflare')} Cloudflare</div>
            <div class="provider-wordmark">
              ${icon('fal')} FLUX <span class="small">via fal.ai</span>
            </div>
          </div>
          <section class="marketing-section" id="features">
            <div class="section-heading">
              <div>
                <div class="eyebrow">Less setup. More creating.</div>
                <h2>A home for your<br />next visual idea.</h2>
              </div>
              <p>
                From your first experiment to your next integration, keep the moving parts in one
                thoughtful workspace.
              </p>
            </div>
            <div class="feature-grid">
              <article class="feature">
                <div class="feature-icon">${icon('key')}</div>
                <h3>Your keys, connected.</h3>
                <p>
                  Bring credentials from OpenAI, Gemini, fal.ai, or Cloudflare Workers AI. Keep them
                  encrypted in Settings and access them through your own ImageAPI key.
                </p>
              </article>
              <article class="feature">
                <div class="feature-icon">${icon('sparkles')}</div>
                <h3>A playground for possibility.</h3>
                <p>
                  Try a prompt. Switch the model. Change the canvas. Explore an idea in the browser
                  before bringing it into your code.
                </p>
              </article>
              <article class="feature">
                <div class="feature-icon">${icon('chart')}</div>
                <h3>A clear view of usage.</h3>
                <p>
                  See your successful generations, request history, and monthly allowance. API calls
                  and playground experiments, all accounted for.
                </p>
              </article>
            </div>
          </section>
        </div>
        <section class="build-section marketing-section">
          <div class="container build-grid">
            <div class="build-copy">
              <div class="eyebrow">Made for the way you build</div>
              <h2>From “what if”<br />to your first request.</h2>
              <p>
                A familiar JSON request, a consistent response, and your choice of model. Spend less
                time wiring providers together.
              </p>
              <div class="steps">
                <div class="step">
                  <span class="step-number">01</span>
                  <div>
                    <h4>Make yourself at home</h4>
                    <p>Create an account and save your ImageAPI key.</p>
                  </div>
                </div>
                <div class="step">
                  <span class="step-number">02</span>
                  <div>
                    <h4>Bring your provider key</h4>
                    <p>Connect an AI provider in your workspace settings.</p>
                  </div>
                </div>
                <div class="step">
                  <span class="step-number">03</span>
                  <div>
                    <h4>Let your idea take shape</h4>
                    <p>Generate in the playground or send your first API request.</p>
                  </div>
                </div>
              </div>
            </div>
            ${codePanel(curlExample(), { footer: 'A consistent response across your connected providers.' })}
          </div>
        </section>
        <div class="container">
          <section class="marketing-section">
            <div class="section-heading">
              <div>
                <div class="eyebrow">A little inspiration</div>
                <h2>Where will your<br />imagination go?</h2>
              </div>
              <p>
                Dream up a different landscape, an impossible space, or a new way to see the
                everyday.
              </p>
            </div>
            <div class="creative-grid">
              <div class="creative-tile">
                <img
                  src="/static/assets/dreamscape.svg"
                  alt="Pastel moon over rolling dunes"
                  loading="lazy"
                /><span>Otherworldly landscapes</span>
              </div>
              <div class="creative-tile">
                <img
                  src="/static/assets/architecture.svg"
                  alt="Minimal arched architecture"
                  loading="lazy"
                /><span>Spaces worth imagining</span>
              </div>
              <div class="creative-tile">
                <img
                  src="/static/assets/botanical.svg"
                  alt="Botanical still life with citrus"
                  loading="lazy"
                /><span>Everyday, reimagined</span>
              </div>
            </div>
            <p class="gallery-note">
              Illustrative artwork for inspiration. Your generation starts with your prompt.
            </p>
          </section>
          <section class="cta-section">
            <div class="eyebrow centered">Your next idea starts here</div>
            <h2>Make something you haven’t seen.</h2>
            <p>100 images a month on Free. Connect your provider and explore.</p>
            <a class="btn btn-primary btn-lg" href="/signup" data-link
              >Open your workspace ${icon('arrow')}</a
            >
          </section>
        </div>`,
    ),
    mount() {
      bindMarketing();
      bindCode();
    },
  };
}
