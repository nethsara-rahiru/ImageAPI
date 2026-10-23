import { marketingLayout, bindMarketing } from '../components/marketing-layout.js';
import { codePanel, bindCode, curlExample } from '../components/code.js';
import { icon } from '../components/icons.js';
export async function render() {
  const js = `const response = await fetch("${location.origin}/v1/images/generations", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${process.env.IMAGEAPI_KEY}\`,\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    prompt: "A glass greenhouse above a pastel sea",\n    provider: "gemini",\n    model: "gemini-2.5-flash-image",\n    size: "1536x1024",\n    quality: "auto"\n  })\n});\nif (!response.ok) throw new Error(await response.text());\nconst result = await response.json();\n// Node.js: save the PNG\nawait fs.writeFile("image.png",\n  Buffer.from(result.data[0].b64_json, "base64"));`;
  const response = `{\n  "id": "req_…",\n  "created": 1792454400,\n  "provider": "openai",\n  "model": "gpt-image-1",\n  "data": [{\n    "b64_json": "iVBORw0KGgo…",\n    "mime_type": "image/png",\n    "width": 1024,\n    "height": 1024\n  }]\n}`;

  return {
    html: marketingLayout(
      /* HTML */ `<div class="container docs-layout">
        <nav class="docs-nav" aria-label="Documentation sections">
          <a href="#posters">Automated posters</a><a href="#quickstart">Image quickstart</a
          ><a href="#authentication">Authentication</a><a href="#generate">Generate an image</a
          ><a href="#providers">Providers & models</a><a href="#response">Response</a
          ><a href="#examples">Code examples</a><a href="#errors">Errors & limits</a
          ><a href="#privacy">Keys & data</a>
        </nav>
        <article class="docs-content">
          <div class="eyebrow">A small API. A big canvas.</div>
          <h1>Build something worth seeing.</h1>
          <p>
            ImageAPI connects your application to image models through one account and one
            consistent endpoint. You bring your own provider keys; generation is billed by those
            providers.
          </p>
          <h2 id="posters">A finished poster, without manual layout.</h2>
          <p>
            Use <code>POST /v1/posters</code> for artwork, exact typography, and your saved brand in
            one background job. The older image endpoint returns artwork only.
          </p>
          ${codePanel(JSON.stringify({ provider: 'cloudflare', prompt: 'A tropical music festival at golden hour, editorial photography', headline: 'SUMMER NIGHTS', subtitle: 'Live music by the ocean', details: ['15 AUGUST · 6 PM', 'OCEAN PARK'], cta: 'BOOK YOUR PLACE', size: 'portrait', layout: 'auto', format: 'png', retention_hours: 24 }, null, 2), { label: 'POST /v1/posters · JSON', id: 'poster-request-example', footer: 'Authenticate with your ImageAPI bearer key; connect the artwork provider in Settings first.' })}
          <ol>
            <li>
              Submit JSON with <code>Authorization: Bearer YOUR_IMAGEAPI_KEY</code> and a unique
              <code>Idempotency-Key</code> header (8–128 characters). Keep the same key when
              retrying the same submission after a network error.
            </li>
            <li>
              A <code>202</code> response returns a job ID and a <code>Location</code> header. Poll
              <code>GET /v1/posters/{id}</code> until the status is <code>completed</code>,
              <code>failed</code>, or <code>unknown</code>.
            </li>
            <li>
              When complete, use <code>result.downloads.png.url</code> (or
              <code>jpeg</code>/<code>webp</code>) to get the finished binary poster. Links last up
              to 15 minutes. Poll again for fresh links, or use authenticated
              <code>GET /v1/posters/{id}/output/png</code>.
            </li>
          </ol>
          <p>
            Sizes: <code>square</code> (1080×1080), <code>portrait</code> (1080×1350),
            <code>story</code> (1080×1920), <code>landscape</code> (1920×1080), and
            <code>a4</code> (1654×2339, about 141 dpi). PNG, JPEG, and WebP are included with every
            job. See <code>GET /v1/posters/catalog</code> for available layouts and fonts.
          </p>
          <p>
            The exact headline, subtitle, details, and call to action are rendered separately from
            AI artwork. Auto layout chooses a composition from the content; text fitting, minimum
            type sizes, overlap checks, and contrast checks run automatically. When no brand colour
            is supplied, an accent is sampled from the artwork. Copy that cannot fit legibly is
            rejected rather than cut off. Artwork subject accuracy and logo identity still need
            review before publishing.
          </p>
          <h3>Reusable brand profiles</h3>
          <p>
            Save up to ten profiles with <code>POST /v1/brands</code> or the
            <a href="/brands" data-link>Brand profiles page</a>. Fields are <code>name</code>,
            <code>tagline</code>, <code>accent_color</code>, <code>background_color</code>,
            <code>font</code> (sans/display/serif), and optional base64
            <code>logo</code> (PNG/JPEG/WebP under 550 KB). Pass the returned
            <code>brand_id</code> when making a poster. Jobs retain their original brand snapshot.
            List, replace, and delete profiles through <code>/v1/brands</code> and
            <code>/v1/brands/{id}</code>.
          </p>
          <h3>Webhooks and safe retries</h3>
          <p>
            Optionally include <code>webhook: { url, secret }</code>, with a public HTTPS URL on
            port 443 and a secret of at least 24 characters. Receive <code>poster.completed</code>,
            <code>poster.failed</code>, or <code>poster.unknown</code> events. Verify the
            <code>X-ImageAPI-Signature</code> header:
            <code>t=timestamp,v1=HMAC-SHA256(secret, timestamp + "." + rawBody)</code>. Reject
            timestamps older than five minutes and deduplicate <code>event_id</code>. Delivery is
            attempted up to five times with backoff; only deliveries are retried, never image
            generation. Webhook secrets are encrypted and never returned.
          </p>
          <p>
            Poster input is encrypted and output files are private. Retention defaults to 24 hours
            and can be set to 1–168 hours. <code>DELETE /v1/posters/{id}</code> cancels queued work
            or deletes terminal output and revokes its links. Running provider requests cannot
            safely be cancelled. Queued jobs survive restarts; interrupted calls become
            <code>unknown</code> because the provider may already have charged. A lightweight
            idempotency tombstone remains after output expiry, preventing accidental resubmission
            with an old key.
          </p>
          <p>
            See the repository’s <code>examples/poster.mjs</code> for a complete submit → poll →
            download client and <code>examples/verify-webhook.mjs</code> for signature verification.
            These endpoints use the same monthly allowance as image generation. Automatic
            composition does not incur a second AI call.
          </p>
          <h2 id="quickstart">Your first image, in three steps.</h2>
          <ol>
            <li>
              <a class="text-link" href="/signup" data-link>Create an account</a> and save the
              ImageAPI key and recovery code shown at signup.
            </li>
            <li>
              Open <a class="text-link" href="/settings" data-link>Settings</a> and add a key from
              OpenAI, Google Gemini, fal.ai, or Cloudflare Workers AI.
            </li>
            <li>
              Send this request from your server. Replace <code>YOUR_IMAGEAPI_KEY</code> with your
              own key.
            </li>
          </ol>
          ${codePanel(curlExample(), { id: 'docs-curl' })}
          <h2 id="authentication">Two keys. Two different jobs.</h2>
          <p>
            Your <strong>ImageAPI key</strong> authenticates your application. Pass it in the
            <code>Authorization: Bearer ia_live_…</code> header. Create and revoke keys on the
            <a class="text-link" href="/api" data-link>API page</a>. An account can have 10 active
            keys; the full secret is displayed only at creation.
          </p>
          <p>
            Your <strong>provider API key</strong> is saved separately in Settings and used only for
            calls to that provider. ImageAPI never falls back to a platform-owned provider key.
            Bearer keys cannot access account settings, provider credentials, or the dashboard.
            Browser sessions use HttpOnly cookies and CSRF tokens.
          </p>
          <div class="notice">
            ${icon('shield')}<span
              >Keep both types of keys on your server. Don’t embed ImageAPI keys in public frontend
              code, mobile bundles, or a Git repository.</span
            >
          </div>
          <h2 id="generate">Generate an image</h2>
          <p>
            <code>POST /v1/images/generations</code> accepts JSON and produces one PNG. The
            playground uses this same generation flow. The legacy
            <code>/v1/images/generate</code> path is an authenticated alias.
          </p>
          <div class="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type / default</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>prompt</code></td>
                  <td>string · required</td>
                  <td>1–12,000 characters after trimming. Describe the image you want.</td>
                </tr>
                <tr>
                  <td><code>provider</code></td>
                  <td>string · openai</td>
                  <td>
                    <code>openai</code>, <code>gemini</code>, <code>fal</code>, or
                    <code>cloudflare</code>. Connect that provider in Settings first.
                  </td>
                </tr>
                <tr>
                  <td><code>model</code></td>
                  <td>string · provider default</td>
                  <td>
                    Must be a supported model for the selected provider. See the catalog below.
                  </td>
                </tr>
                <tr>
                  <td><code>size</code></td>
                  <td>string · 1024x1024</td>
                  <td>
                    <code>1024x1024</code>, <code>1536x1024</code>, or <code>1024x1536</code>.
                    Gemini maps these to 1:1, 3:2, or 2:3 aspect ratios; actual pixels depend on the
                    model.
                  </td>
                </tr>
                <tr>
                  <td><code>quality</code></td>
                  <td>string · auto</td>
                  <td>
                    OpenAI: <code>auto</code>, <code>low</code>, <code>medium</code>,
                    <code>high</code>. Gemini, fal.ai, and Cloudflare: <code>auto</code> only.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <h2 id="providers">Pick your provider.</h2>
          <div class="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Supported models</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>OpenAI</td>
                  <td>
                    <code>gpt-image-1</code><br /><code>gpt-image-1-mini</code><br /><code
                      >gpt-image-1.5</code
                    >
                  </td>
                  <td><code>gpt-image-1</code></td>
                </tr>
                <tr>
                  <td>Google Gemini</td>
                  <td>
                    <code>gemini-2.5-flash-image</code><br /><code>gemini-3.1-flash-image</code
                    ><br /><code>gemini-3-pro-image</code>
                  </td>
                  <td><code>gemini-2.5-flash-image</code></td>
                </tr>
                <tr>
                  <td>FLUX via fal.ai</td>
                  <td><code>fal-ai/flux/schnell</code><br /><code>fal-ai/flux/dev</code></td>
                  <td><code>fal-ai/flux/schnell</code></td>
                </tr>
                <tr>
                  <td>Cloudflare Workers AI</td>
                  <td><code>@cf/black-forest-labs/flux-1-schnell</code></td>
                  <td><code>@cf/black-forest-labs/flux-1-schnell</code></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Cloudflare setup: open Workers AI → Use REST API in your Cloudflare dashboard, create a
            token with Workers AI Read and Edit permissions, then save that token and your
            32-character Account ID in Settings. Use <code>provider: "cloudflare"</code>. FLUX
            Schnell accepts up to 2,048 prompt characters, <code>quality: "auto"</code>, and native
            square output (<code>size: "1024x1024"</code>); actual dimensions appear in the
            response. Cloudflare’s daily free allowance and ImageAPI’s monthly allowance are
            separate.
            <a
              href="https://developers.cloudflare.com/workers-ai/get-started/rest-api/"
              target="_blank"
              rel="noopener noreferrer"
              >Cloudflare setup guide</a
            >. <code>GET /api/catalog</code> returns the current supported catalog. Model
            availability depends on your provider account and region. Provider references:
            <a
              class="text-link"
              href="https://platform.openai.com/docs/guides/image-generation"
              target="_blank"
              rel="noopener noreferrer"
              >OpenAI</a
            >,
            <a
              class="text-link"
              href="https://ai.google.dev/gemini-api/docs/image-generation"
              target="_blank"
              rel="noopener noreferrer"
              >Gemini</a
            >,
            <a
              class="text-link"
              href="https://fal.ai/models/fal-ai/flux/schnell/api"
              target="_blank"
              rel="noopener noreferrer"
              >fal.ai</a
            >.
          </p>
          <h2 id="response">A consistent response.</h2>
          <p>
            The response includes a verified, metadata-stripped PNG as base64. Decode
            <code>data[0].b64_json</code> to save the image. ImageAPI does not host a permanent
            image URL. Prompts and generated images are not stored.
          </p>
          ${codePanel(response, { label: 'JSON response · example', id: 'docs-response' })}
          <h2 id="examples">Make it part of your app.</h2>
          <p>
            These examples run on your server. For JavaScript, import <code>fs</code> from
            <code>node:fs/promises</code>. The application itself runs on Node.js 24 or later.
          </p>
          ${codePanel(js, { label: 'JavaScript · Node.js', id: 'docs-js' })}
          <h2 id="errors">Know what to expect.</h2>
          <p>
            Errors return JSON with a <code>detail</code> message. Generation errors after a
            reservation also include an <code>X-Request-ID</code> response header, which matches
            your dashboard history.
          </p>
          <div class="card table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                ${[
                  [400, 'Provider rejected the prompt or settings.'],
                  [401, 'ImageAPI key is invalid or revoked, or your browser session expired.'],
                  [403, 'Browser origin or CSRF check failed. Refresh and try again.'],
                  [409, 'The selected provider needs a key in Settings.'],
                  [413, 'Request body exceeds the configured limit (1 MiB for JSON).'],
                  [422, 'Request validation failed, or the provider returned no image.'],
                  [424, 'Provider rejected its key or your access to the model.'],
                  [
                    429,
                    'Monthly allowance, concurrency, request rate, or provider quota was reached.',
                  ],
                  [502, 'Provider error or invalid image response.'],
                  [503, 'Provider connection or encryption configuration is unavailable.'],
                  [504, 'Generation timed out. The provider may still have charged the request.'],
                ]
                  .map(
                    ([status, meaning]) =>
                      /* HTML */ `<tr>
                        <td><code>${status}</code></td>
                        <td>${meaning}</td>
                      </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
          <p>
            Free accounts get <strong>100 images per calendar month (UTC)</strong>, shared by the
            playground and API. Up to two requests may run concurrently, and up to 20 generation
            attempts are allowed per minute. Successful, pending, and interrupted requests with
            unknown outcomes count toward the allowance; failed requests do not. Provider charges
            may still apply to timed-out or failed requests.
          </p>
          <p>
            The synchronous image endpoint has no automatic retry or idempotency guarantee. Poster
            jobs support Idempotency-Key and durable polling. Don’t automatically retry timeouts:
            inspect your provider’s usage first to avoid duplicate charges. Requests may take up to
            three minutes. An interrupted request is marked “Unknown” after five minutes when usage
            is viewed or the next generation is attempted.
          </p>
          <h2 id="privacy">Your keys. Your data.</h2>
          <p>
            Provider keys are encrypted with AES-256-GCM and never returned in full. ImageAPI bearer
            keys and session tokens are stored as hashes. Passwords use salted scrypt. Only model,
            provider, size, source, status, and timing metadata is kept in usage logs. Poster jobs
            additionally retain encrypted copy, a brand snapshot, and private output files for their
            configured lifetime.
          </p>
          <p>
            Save your recovery code. There are no password reset emails in this local release.
            Recovery rotates that code and revokes all browser sessions and ImageAPI keys. Account
            deletion removes your saved credentials and usage history from the active database;
            operators must apply the same retention policy to their backups.
          </p>
          <p>
            This build runs locally. Plus, Pro, and Enterprise are pricing previews with no
            checkout. For operator setup, encryption-key backups, and deployment requirements, see
            the repository README.
          </p>
          <a class="btn btn-primary" href="/playground" data-link
            >Try it in the playground ${icon('arrow')}</a
          >
        </article>
      </div>`,
      'docs',
    ),
    mount() {
      bindMarketing();
      bindCode();
    },
  };
}
