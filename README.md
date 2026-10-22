# ImageAPI · Automated Poster Studio

An automated poster design and image-generation platform built with **Node.js 24, Express, SQLite, and vanilla HTML/CSS/JavaScript**. There is no Python runtime or frontend build step.

Users create an account, connect their own OpenAI/Gemini/fal.ai/Cloudflare credentials, get personal ImageAPI keys, generate complete posters in the Studio or over the API, and track real usage. Poster typography and logos are composed separately from AI artwork.

## Run

Install Node.js 24 LTS or later, then:

```bash
git clone --branch feat/image-api-starter https://github.com/nethsara-rahiru/ImageAPI.git
cd ImageAPI
npm ci
npm start
```

Open **http://127.0.0.1:8080**. Node starts the backend and serves the frontend together. SQLite is built into Node; Sharp performs image processing. npm installs the platform-specific Sharp binaries automatically on supported systems.

Create an account, save the **ImageAPI key and recovery code** shown once, add your AI provider key in **Settings**, then generate in **Playground** or the **API** page. Provider keys are checked during generation, not at save time. No global provider key or fake-success mode is used.

For the existing Ubuntu VPS, upgrades, SSH tunnel, systemd, and HTTPS setup, see **[deploy/README.md](deploy/README.md)**. The new default port is **8080**.

## Features

- Automatic finished posters: five design directions, exact vector typography, artwork-matched accents, saved brand profiles, raster logos, five canvas sizes, and readability checks.
- Durable background jobs, account-scoped idempotency, signed short-lived downloads, configurable retention, and signed webhooks with delivery-only retries.
- Email/password registration, login/logout, recovery codes, password changes, and account deletion.
- Persistent SQLite accounts, sessions, API keys, provider credentials, and usage metadata.
- Async salted scrypt password hashing, HttpOnly cookies, CSRF/origin checks, bounded JSON/uploads, persistent rate limits, and security headers.
- One default ImageAPI key at signup; named keys, masked identifiers, last-used times, revocation, and 10 active keys per account. Full secrets are shown only once and stored as SHA-256 hashes.
- Per-account AI provider credentials encrypted with AES-256-GCM, never returned in full. Fixed upstream hosts and allowlisted models avoid arbitrary credential forwarding.
- OpenAI, Google Gemini, FLUX through fal.ai, and Cloudflare Workers AI. “Flex” is interpreted as FLUX; custom provider URLs are not enabled.
- A prompt/model/size/quality playground with generation states, errors, inspiration prompts, and PNG download. It requires a saved provider key.
- A real dashboard with monthly totals, success rate, average duration, daily activity, provider counts, pagination, and request-status filters.
- Atomic quota reservations and concurrency limits shared by API and playground.
- Light blue/white responsive landing, pricing, account, dashboard, API, settings, and documentation pages. Local SVG artwork, animations, transitions, and reduced-motion support; no React.
- Authenticated image resizing/conversion, consistent generation responses, OpenAPI, and server-side JavaScript examples.
- Node backend/protocol/migration tests and Playwright browser/accessibility suites. CI uses Node only.

## Existing Python installations

**Stop the Python server before starting Node against the same database.** Retain your original `IMAGEAPI_DATA_DIR` and encryption key. Do not delete the data folder or replace the encryption secret.

The Node server reads the existing SQLite schema directly. Before its first legacy migration it makes a consistent database backup (and a copy of the local encryption-key file, if present) in `data/backups/`. It preserves accounts, API keys, browser sessions, provider connections, and usage. Legacy scrypt passwords are verified and upgraded on login; Fernet provider credentials are authenticated/decrypted and upgraded to AES-GCM when used. None of this requires Python.

If you use `IMAGEAPI_ENCRYPTION_KEY` from the environment, keep exactly that same value and back it up separately. The encryption key remains a base64url-encoded 32-byte key. Automatic backups do not include externally configured secrets.

The new credential formats are not readable by the old Python backend. A rollback requires restoring the complete pre-migration database and encryption key together. Keep a separate backup before updating, even though the first Node migration also creates one. Tests include fixtures produced by the original Python implementation and exercise a complete legacy database migration.

## Configuration

`npm start` automatically loads `.env` if present. Copy `.env.example` to `.env` to customize; explicit shell environment variables take precedence.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Listen interface; keep loopback behind a reverse proxy or SSH tunnel |
| `PORT` | `8080` | HTTP port |
| `IMAGEAPI_PUBLIC_ORIGIN` | `http://127.0.0.1:<PORT>` | Exact browser origin, without a trailing slash |
| `IMAGEAPI_DATA_DIR` | `./data` | SQLite database and local encryption key |
| `IMAGEAPI_SECURE_COOKIES` | `false` | Set `true` when the public origin uses HTTPS |
| `IMAGEAPI_ENCRYPTION_KEY` | Generated locally | Base64url-encoded 32-byte encryption key |

To run on a different local port:

```bash
PORT=9090 IMAGEAPI_PUBLIC_ORIGIN=http://127.0.0.1:9090 npm start
```

Windows PowerShell:

```powershell
$env:PORT='9090'
$env:IMAGEAPI_PUBLIC_ORIGIN='http://127.0.0.1:9090'
npm start
```

Use the exact configured origin in your browser, or writes will be rejected. No CORS access is enabled for browser clients on other origins. Server-side bearer clients do not need an Origin header. Forwarded IP headers are not trusted; behind a proxy, authentication IP throttling applies to the proxy socket address. Configure an appropriate outer gateway rate policy before a large public launch.

Provider calls use Undici's environment-aware HTTP proxy support, preserving `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, and Node's configured CA trust. Redirects are not followed with provider credentials.

## Pricing and limits

| Plan | Proposed price | Images / month | Status |
| --- | --- | --- | --- |
| Free | $0 | 100 | Available |
| Plus | $9/month | 2,000 | Preview only |
| Pro | $29/month | 10,000 | Preview only |
| Enterprise | Custom | Custom | Preview only |

**Payments and subscriptions are not enabled. All accounts use Free.** Paid prices/features are clearly labeled previews and do not activate upgrades. Provider charges are separate and paid directly through users' own provider accounts. The dashboard reports counts/timing, not guessed provider spending.

Free allows 100 images per calendar month (reset at 00:00 UTC on the first day), 20 generation attempts/minute, two simultaneous generations, and 10 active API keys. API/playground share the allowance. Successful, pending, and unknown-outcome requests count. Failed requests do not, although providers may still bill some failures or timeouts. Reservations are atomic across concurrent requests.

Interrupted reservations become `unknown` after five minutes when usage is viewed or another request is attempted, because the provider may have completed the work. There is no automatic retry or idempotency guarantee. Inspect provider usage before retrying a timeout to avoid duplicate charges.

## Generate over the API

```bash
curl --fail-with-body http://127.0.0.1:8080/v1/images/generations \
  -H 'Authorization: Bearer YOUR_IMAGEAPI_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "A glass greenhouse above a pastel sea at sunrise",
    "provider": "openai",
    "model": "gpt-image-1",
    "size": "1024x1024",
    "quality": "auto"
  }' > response.json
```

Decode the returned image with Node:

```js
import { readFile, writeFile } from 'node:fs/promises';
const result = JSON.parse(await readFile('response.json', 'utf8'));
await writeFile('image.png', Buffer.from(result.data[0].b64_json, 'base64'));
```

| Field | Accepted values |
| --- | --- |
| `prompt` | Required; 1–12,000 nonblank characters after trimming (Cloudflare: up to 2,048) |
| `provider` | `openai` (default), `gemini`, `fal`, `cloudflare` |
| `model` | Supported model from `/api/catalog`; provider default when omitted |
| `size` | `1024x1024` (default), `1536x1024`, `1024x1536`; Cloudflare: native square only |
| `quality` | `auto` (default); OpenAI also supports `low`, `medium`, `high` |

Unknown generation fields are rejected. One verified, metadata-stripped PNG is returned per request. JSON includes `id`, `created`, `provider`, `model`, and `data[0]` with `b64_json`, `mime_type`, `width`, and `height`. The synchronous endpoint has no permanent image URLs; the poster endpoint supplies short-lived download links. Gemini maps size to aspect ratio (1:1, 3:2, 2:3); actual pixels depend on the model. Provider account access, region, moderation, quota, pricing, and model availability apply.

`/v1/images/generate` remains an authenticated alias with the same JSON contract. No platform-owned OpenAI/Gemini/fal/Cloudflare key is used. The caller must first save a credential for that provider under their own account.

Generation errors are sanitized and include `X-Request-ID` after a reservation exists. Provider calls have a three-minute timeout and bounded response size. Provider hosts/model IDs are fixed in `server/providers/catalog.js` and adapters. The upstream protocols follow [OpenAI](https://platform.openai.com/docs/guides/image-generation), [Gemini GenerateContent](https://ai.google.dev/gemini-api/docs/generate-content/image-generation), and [fal FLUX](https://fal.ai/models/fal-ai/flux/schnell/api).

The `/docs` page covers request options and errors; `/openapi.json` documents the machine-readable image API.

## Routes

| Endpoint | Purpose |
| --- | --- |
| `/`, `/pricing`, `/docs` | Public pages |
| `/signup`, `/login`, `/recover` | Account entry and recovery |
| `/dashboard`, `/api`, `/playground`, `/settings` | Authenticated workspace |
| `POST /api/auth/register`, `/login`, `/recover` | Authentication and recovery |
| `GET /api/auth/me` | Current user and CSRF token |
| `POST /api/auth/logout`, `/password` | Logout or change password |
| `DELETE /api/auth/account` | Delete own account with password confirmation |
| `GET/POST /api/keys`, `DELETE /api/keys/:id` | ImageAPI keys |
| `GET /api/providers`, `PUT/DELETE /api/providers/:id` | Own saved provider keys |
| `GET /api/usage` | Real usage; `page` and `status` filters |
| `GET /api/catalog`, `/api/plans` | Model and pricing catalogs |
| `POST /v1/images/generations` | Image generation |
| `POST /v1/images/transform` | Resize/convert upload |
| `GET /health` | Liveness, version, and `runtime: "node"`; not provider readiness |

ImageAPI bearer keys authorize image endpoints only, not account management or usage/settings reads. Browser sessions authorize account operations and generation. All cookie-authenticated writes require `X-CSRF-Token`, returned by registration, login, and `/api/auth/me`. Store ImageAPI keys in your application's backend; never ship them in public frontend bundles.

Transform accepts JPEG/PNG/WebP up to 10 MiB and 20 million decoded pixels. `width`/`height` bound the result (1–4096); aspect ratio is preserved without upscaling. Output `format` is `jpeg`, `png`, or `webp`; `quality` is 1–100. JPEG transparency is flattened on white, EXIF orientation is applied, metadata is removed, and animations use the first frame. Transform has a separate 30 requests/minute account limit and does not count toward generated-image quota.

## Security and operations

Passwords use async scrypt (N=32768, r=8, p=3) with random salts. Session and API tokens use 256 random bits and are stored as SHA-256 hashes. Provider credentials use authenticated AES-256-GCM. The browser stores no credentials in localStorage/sessionStorage. JSON validation errors omit submitted inputs, so passwords/keys are not echoed. Body limits apply before JSON parsing; multipart uploads have file/part limits and decoded image limits.

SQLite uses WAL, foreign keys, indexed request metadata, short synchronous transactions, and owner-private data files. It targets a single application instance with durable local storage. Do not use stateless multi-replica hosting without replacing/coordinating persistence and limits. Password hashing and Sharp image work run outside the JavaScript event loop; provider HTTP is asynchronous.

Synchronous image prompts and bytes are processed in memory, never persisted to application storage. Poster jobs retain encrypted input and brand snapshots plus private output files for 1–168 hours (24 hours by default); expiry/delete removes the copy and files. A minimal idempotency tombstone and usage metadata remain. Brand profiles persist until deleted. Metadata includes provider/model/size/source/status/timing. Providers process prompts under their own policies. Full provider keys and bearer secrets are never logged or returned after creation.

There is no SMTP or email verification. Recovery uses the one-time code shown at signup; it rotates the code and revokes all sessions and ImageAPI keys. A password change revokes sessions but preserves ImageAPI keys. Account deletion removes active database records; backups remain subject to operator retention.

Back up SQLite and the encryption key securely. Losing/changing the key does not automatically rotate credentials: users must reconnect them. For public deployment use HTTPS, secure cookies, the exact origin, durable storage, a stable secret-manager encryption key, and appropriate external connection/rate limits. Protect backups separately. Do not copy a live SQLite database without accounting for WAL; use the SQLite backup API or a stopped-server copy.

SIGINT/SIGTERM stop accepting new connections and drain current requests before closing the database. A busy port gives a clear error rather than starting another instance. The supplied systemd and Caddy examples are optional, reviewed templates; starting the app does not modify a VPS firewall or replace existing web server configuration.

## Code organization

```text
server/
  index.js              Start/listen and graceful shutdown
  app.js                App factory and HTTP/static routing
  config/               Environment validation, plans, OpenAPI
  db/                   Schema, legacy backup/migration, transactions
  auth/                 Session/bearer middleware and token issuance
  security/             Scrypt, token hashes, AES-GCM, Fernet read compatibility
  middleware/           Origin checks and response security headers
  providers/            One adapter per provider; bounded proxy-aware transport
  services/             Validation, usage reservations, dashboard, image processing
  routes/               Accounts, API keys, dashboard, generation, transforms
frontend/
  index.html            Buildless application shell
  assets/               Local original SVG artwork
  css/                  Tokens, base, components, marketing, workspace, account styles
  js/core/              API client, state, router, forms, escaping
  js/components/        Layouts, dialogs, icons, chart, history, code blocks, toasts
  js/pages/             One module per page, shared playground
scripts/                JavaScript syntax checks
deploy/                 VPS guide, systemd unit, HTTPS proxy example
tests/
  node/                 Native node:test API, security, provider, and migration tests
  browser/              Playwright flows and isolated Node test server
  fixtures/             Non-secret legacy compatibility test data
```

## Test

```bash
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

With an installed Chromium, set `IMAGEAPI_CHROMIUM_PATH=/usr/bin/chromium`. No Python is needed for testing. Browser tests start an isolated Node server on 8765, create a temporary database, and substitute deterministic provider responses only in that test module. Production `npm start` has no mock provider switch. Tests make no paid provider calls.

Backend coverage includes account isolation, password/session/recovery behavior, encryption/tamper checks, key lifecycle, quotas, concurrent reservations, UTC resets, upload limits, provider protocols/error redaction, API/static routes, and real legacy migration fixtures. Browser coverage includes signup, credential handoff, settings, playground/download, bearer requests, actual usage changes, key revocation, recovery/login, mobile layouts, and automated accessibility checks.

Use `npm run format` or `npm run format:check` for formatting. CI runs Node syntax, backend, and browser tests. Real provider calls still require valid account-owned keys and were not made during development. Paid plans remain previews with no checkout or subscription activation.

## OpenAI returns HTTP 429 although ImageAPI usage is below its limit

ImageAPI's monthly image allowance and OpenAI's API billing/rate limits are independent. A saved key is not proof of available API credits or permission to use every image model. ChatGPT subscriptions and API billing are also separate.

ImageAPI classifies recognized OpenAI error codes without forwarding raw provider error messages:

- `credit_balance_exhausted`: check the key-owning organization's prepaid API credits.
- `project_spend_limit_exceeded` / `organization_spend_limit_exceeded`: review the enforced spend limit for that project or organization.
- `organization_usage_limit_exceeded`: review the organization’s OpenAI-approved usage limit.
- `insufficient_quota` / billing errors: check API billing, credits, and project/organization limits; a retry alone does not restore quota.
- `rate_limit_exceeded` / `slow_down`: a temporary rate limit; check the model/project rate limits and honor a valid provider `Retry-After` header.

Specific codes take precedence over the broader `insufficient_quota` type. Unknown errors remain generic rather than guessing a cause. Diagnostic bodies are bounded and raw messages/credentials are never exposed. Recognized codes are recorded in request history, and a valid upstream request ID is returned in `X-Provider-Request-ID`. No automatic retries or paid test calls are made.

See [OpenAI’s 429 troubleshooting guide](https://help.openai.com/en/articles/5955604-troubleshooting-api-rate-limits-and-429-errors) and [separate ChatGPT/API billing](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform). Earlier generic 429 records cannot be retroactively classified; update the app and inspect the next error.

## A provider rejects authentication or access

Update the checkout and restart the running Node process before retrying. Errors now identify OpenAI, Google Gemini, or fal.ai and the upstream HTTP status. HTTP 401 means authentication was rejected; replace that provider’s saved credential in Settings, using its own API key rather than an ImageAPI bearer key. HTTP 403 means access was denied and can involve model permissions, account eligibility, server location, or key restrictions; it does not alone prove the key is invalid. Recognized OpenAI codes and Google structured restriction reasons receive specific guidance. Raw provider messages and key metadata are never returned to clients.

A Gemini key restricted to browser HTTP referrers cannot authorize this backend’s requests; configure restrictions appropriate for your server. fal.ai requires a fal.ai key for FLUX models. Saving a credential stores it securely but does not verify provider access. Share only the resulting error text and selected provider/model when diagnosing failures, never the credential.


## Cloudflare Workers AI (FLUX Schnell)

1. In the Cloudflare dashboard, open **Workers AI → Use REST API**.
2. Create a Workers AI token with **Workers AI Read and Edit** permissions for your account and copy the **Account ID** (32 hexadecimal characters).
3. In ImageAPI **Settings → Cloudflare Workers AI**, enter the Account ID and token and save. Both are encrypted together; the full token and account ID are never returned by the settings API. Re-enter both when replacing credentials.
4. Select Cloudflare in the playground, or call the existing generation endpoint with your ImageAPI bearer key:

```json
{
  "provider": "cloudflare",
  "model": "@cf/black-forest-labs/flux-1-schnell",
  "prompt": "A little glass greenhouse above a pastel sea",
  "size": "1024x1024",
  "quality": "auto"
}
```

The model defaults automatically when omitted. This model accepts at most 2,048 prompt characters and uses four inference steps. The documented model API has no width/height controls: ImageAPI offers native square output only and reports actual pixel dimensions; it does not send unsupported size parameters or upscale provider output. Other requested canvas sizes are rejected before a provider call. Output is verified and normalized to PNG like other providers. Failed calls do not consume ImageAPI’s monthly allowance.

Cloudflare offers 10,000 free Neurons per day, shared across Workers AI models; the number of images varies with compute usage. Provider limits and ImageAPI’s monthly allowance are separate. There is no platform-owned token or automatic fallback. No database migration or additional package is required for this integration.

References: [Cloudflare REST setup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/), [FLUX Schnell schema](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/), [current free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/).

## Finished posters (v2)

Open **Poster studio** after connecting an artwork provider. Enter the exact headline and optional subtitle/details/CTA separately from the artwork prompt. Layout, font fitting, colour harmonisation, text contrast, and export composition are automatic; there is no manual positioning stage. **Brand profiles** save your logo, colours, type style, and tagline. Each job snapshots its brand so later edits do not change existing posters.

### Complete API workflow

Use your ImageAPI key, not the Cloudflare token, for these requests:

```bash
curl http://127.0.0.1:8080/v1/posters \
  -H "Authorization: Bearer $IMAGEAPI_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: campaign-summer-2026-v1' \
  --data '{
    "provider": "cloudflare",
    "prompt": "A tropical music festival at golden hour, premium editorial photography",
    "headline": "SUMMER NIGHTS",
    "subtitle": "Live music by the ocean",
    "details": ["15 AUGUST · 6 PM", "OCEAN PARK"],
    "cta": "BOOK YOUR PLACE",
    "layout": "auto",
    "size": "portrait",
    "format": "png",
    "retention_hours": 24
  }'
```

The response is **202 Accepted** with a job `id` and `Location`. Poll `GET /v1/posters/{id}` using the same bearer key. When `status` becomes `completed`, `result.downloads.png.url` (and `jpeg`/`webp`) returns the final binary poster without another AI call. Links expire after at most 15 minutes; fetch the job again for fresh links. Authenticated `GET /v1/posters/{id}/output/png` also downloads the final file. `result` includes the layout, selected palette, typography manifest, dimensions, format sizes, and quality report. Errors appear in the job’s `error` field.

For a fully automated client that submits, polls, and writes `poster.png`:

```bash
IMAGEAPI_KEY=your_imageapi_key IMAGEAPI_BASE_URL=http://127.0.0.1:8080 node examples/poster.mjs
```

| Field | Limits/default |
| --- | --- |
| `prompt` | Required artwork direction, up to 4,000 characters; provider instructions reserve space and Cloudflare’s prompt is bounded to 2,048 |
| `headline` | Required, up to 160 characters |
| `subtitle` | Up to 260 characters |
| `details` | Up to five strings, each 120 characters |
| `eyebrow`, `cta` | Each up to 48 characters |
| `provider`, `model` | Cloudflare by default; selected provider’s default model when omitted |
| `layout` | `auto`, `editorial`, `minimal`, `bold`, `event`, `sale` |
| `size` | `square` 1080×1080; `portrait` 1080×1350 (default); `story` 1080×1920; `landscape` 1920×1080; `a4` 1654×2339 (about 141 dpi, not 300 dpi print output) |
| `brand_id` | Optional owned brand profile; job takes an encrypted snapshot |
| `accent_color`, `font` | Optional overrides; six-digit hex; `sans`/`display`/`serif` |
| `format` | Preferred download format: `png` default, `jpeg`, `webp`; all three generated |
| `retention_hours` | 1–168 hours; 24 by default, measured from submission |
| `webhook` | Optional `{ "url": "https://your-domain/callback", "secret": "at-least-24-characters" }` |

### Brands, jobs, and retention

- `GET/POST /v1/brands`, `PUT/DELETE /v1/brands/{id}` manage up to ten owned profiles. Profile fields: `name`, `tagline`, `accent_color`, `background_color`, `font`, optional base64 `logo`. Logos are validated/re-encoded PNG/JPEG/WebP under 550 KB and four million pixels. SVG, remote URLs, and arbitrary font files are not accepted. PUT replaces the entire profile; omit `logo` to clear it.
- `GET /v1/posters/catalog` returns layouts, fonts, and dimensions. `GET /v1/posters?limit=20&offset=0` lists owned jobs.
- `DELETE /v1/posters/{id}` cancels queued work or deletes terminal copy and output. It revokes output links. Running provider calls cannot safely be cancelled. A minimal tombstone remains for account-scoped idempotency.
- Use the **same** `Idempotency-Key` for a retry of the same POST. Reusing it with different content returns 409. Even after expiry/deletion, reusing it returns the tombstone instead of generating another billable image. Submit a new key only when you intentionally want a new generation.
- States: `queued → running → completed/failed/unknown`, then `expired` or `deleted`. Queued jobs resume after restart. Running jobs interrupted by a restart become `unknown`; they are never automatically regenerated. Check provider usage before explicitly creating another job. Unknown outcomes count against the monthly allowance.
- Two artwork jobs run by default, with a maximum of twenty outstanding poster jobs and one hundred retained inputs per account. Delete old jobs or let retention expire to free input capacity. Queued work reserves remaining monthly submission capacity. Image and poster calls share monthly quota and per-account concurrency. Queue acceptance does not guarantee provider capacity or remaining quota at execution time.
- Outputs are private files under `data/posters`, not public static assets. Input/brand snapshots and webhook secrets are encrypted in SQLite. Retention cleanup runs while the app runs; after an offline period it resumes when the app starts. Backups must follow your own retention policy. Signed links are capability credentials: anyone holding a valid link can read that one file until expiry or deletion.

### Signed webhooks

Include the optional `webhook` object to receive `poster.completed`, `poster.failed`, or `poster.unknown`. URLs must be public HTTPS on port 443. DNS answers are checked and pinned for the socket; private, loopback, mapped private addresses, and redirects are blocked. Requests time out after ten seconds. Only webhook delivery is retried, at most five total attempts, with 5/30/120/600-second retry delays. Event IDs are stable per job outcome; store them uniquely to deduplicate deliveries.

Verify `X-ImageAPI-Signature: t=<unix-seconds>,v1=<hex-hmac>` against `HMAC-SHA256(secret, timestamp + "." + rawRequestBody)`, reject timestamps more than five minutes old, and compare signatures in constant time. A complete verifier is in `examples/verify-webhook.mjs`. Do not JSON-reserialize the body before checking the signature. Job responses expose webhook delivery state/attempt count, never its secret. HTTP redirects are not followed.

### Typography and quality limits

The compositor uses bundled, licensed fonts and vector glyph outlines at the final poster resolution. Text is never painted by the AI. Font fitting wraps without deleting words, selects readable sizes, anchors event details/CTA, and checks bounds, overlaps, and foreground contrast. Contrast ink is selected automatically for the paper and CTA colours; unbranded accent colours are sampled from the artwork. Latin, Greek, Cyrillic, Arabic, Sinhala, and Tamil glyphs are available; emoji and missing characters are rejected before a provider call. The bundled fonts have separate licenses in `server/assets/fonts`.

The renderer produces consistent designed layouts, **not a guarantee that arbitrary artwork equals a professional human designer’s judgement**. Geometry/readability checks do not certify subject accuracy, flawless cropping, brand identity, or advertising correctness. Long copy that cannot fit at the minimum readable size fails preflight instead of silently truncating. Raster logo fidelity depends on the input; small logos are not enlarged. Review generated imagery before publishing. Backgrounds may be enlarged to the output canvas; the quality report flags this while typography remains full-resolution.

### Local upgrade and operational settings

This release leaves hosting unchanged. Back up `data/` and the encryption key, stop the old Node process, update the checkout, run `npm ci`, and start with your existing host/port/origin settings. Database v2 is automatically backed up under `data/backups/before-posters-*` and upgraded to v3 while preserving accounts and credentials. Do not start two application instances against the same SQLite data directory. Rollback across the schema upgrade requires restoring the full backup and key.

- `IMAGEAPI_POSTER_WORKERS`: 1–4, default 2. The service remains a single Node/SQLite instance.
- `IMAGEAPI_POSTER_STORAGE_MB`: output storage cap, default 512 MiB (32–10,240). Exports are serialized against this cap; storage exhaustion fails clearly and never silently deletes unexpired user files.
- Existing `IMAGEAPI_DATA_DIR`, encryption key, provider limits, and public origin settings continue to apply. Keep durable local storage writable for the service owner.

To render reproducible composition samples without making AI requests:

```bash
npm run poster:samples
# Or supply an existing artwork PNG:
npm run poster:samples -- --background /path/to/artwork.png --out /path/to/samples
```

These sample outputs demonstrate typography/layout only; the default artwork is a local illustration, not a live-provider result.
