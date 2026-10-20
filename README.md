# ImageAPI · Node.js

A complete image-generation platform built with **Node.js 24, Express, SQLite, and vanilla HTML/CSS/JavaScript**. There is no Python runtime or frontend build step.

Users create an account, connect their own OpenAI/Gemini/fal.ai credentials, get personal ImageAPI keys, generate in a playground or over the API, and track real usage.

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

- Email/password registration, login/logout, recovery codes, password changes, and account deletion.
- Persistent SQLite accounts, sessions, API keys, provider credentials, and usage metadata.
- Async salted scrypt password hashing, HttpOnly cookies, CSRF/origin checks, bounded JSON/uploads, persistent rate limits, and security headers.
- One default ImageAPI key at signup; named keys, masked identifiers, last-used times, revocation, and 10 active keys per account. Full secrets are shown only once and stored as SHA-256 hashes.
- Per-account AI provider credentials encrypted with AES-256-GCM, never returned in full. Fixed upstream hosts and allowlisted models avoid arbitrary credential forwarding.
- OpenAI, Google Gemini, and FLUX through fal.ai. “Flex” is interpreted as FLUX; custom provider URLs are not enabled.
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
| `prompt` | Required; 1–12,000 nonblank characters after trimming |
| `provider` | `openai` (default), `gemini`, `fal` |
| `model` | Supported model from `/api/catalog`; provider default when omitted |
| `size` | `1024x1024` (default), `1536x1024`, `1024x1536` |
| `quality` | `auto` (default); OpenAI also supports `low`, `medium`, `high` |

Unknown generation fields are rejected. One verified, metadata-stripped PNG is returned per request. JSON includes `id`, `created`, `provider`, `model`, and `data[0]` with `b64_json`, `mime_type`, `width`, and `height`. There are no permanent image URLs. Gemini maps size to aspect ratio (1:1, 3:2, 2:3); actual pixels depend on the model. Provider account access, region, moderation, quota, pricing, and model availability apply.

`/v1/images/generate` remains an authenticated alias with the same JSON contract. No platform-owned OpenAI/Gemini/fal key is used. The caller must first save a credential for that provider under their own account.

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

Prompts and image bytes are processed in memory, never persisted to application storage. Metadata includes provider/model/size/source/status/timing. Providers process prompts under their own policies. Full provider keys and bearer secrets are never logged or returned after creation.

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
