# ImageAPI

A complete local image-generation workspace: a vanilla HTML/CSS/JavaScript frontend and a FastAPI backend. Users create an account, connect their own AI provider credentials, receive ImageAPI keys, and generate through the browser or a consistent JSON API.

## Start locally

Requires Python 3.11+; Python 3.12 is used in CI. Node.js is optional and needed only for frontend formatting and browser tests. No frontend compilation or React is involved.

```bash
git clone https://github.com/nethsara-rahiru/ImageAPI.git
cd ImageAPI
git checkout feat/image-api-starter
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-proxy-headers
```

Open **http://127.0.0.1:8000**. Use this exact origin with the default configuration. To use another hostname or port, set `IMAGEAPI_PUBLIC_ORIGIN` to that origin before starting.

1. Create an account at `/signup`. Passwords require at least 12 characters.
2. Save the **ImageAPI key and recovery code** shown once after signup. They can be downloaded as a text file; keep that file private.
3. In `/settings`, add your own OpenAI, Google Gemini, or fal.ai API key.
4. Generate in `/playground` or `/api`, or call the API from your server.
5. See your real request counts, daily activity, status, and timing at `/dashboard`.

Provider credentials are verified when a generation is attempted, not when they are saved. No platform-owned provider key is used. Provider billing and model access remain with the user’s provider account.

## What’s included

- Responsive landing, pricing, signup, login, recovery, dashboard, settings, API key, playground, and documentation pages.
- Light blue/white design, matching pastel artwork, transitions, animations, mobile navigation, and reduced-motion support. All assets are local.
- Email/password authentication using scrypt password hashes and seven-day HttpOnly session cookies.
- CSRF protection, same-origin browser writes, bounded bodies, persistent rate limits, and account isolation.
- A default ImageAPI key at signup; create named keys, view masked identifiers and last-use dates, and revoke keys. Full secrets appear only once. Up to 10 active keys per account.
- Per-account, Fernet-encrypted provider credentials. No full saved provider key is returned to the browser. Provider hosts and model IDs are allowlisted.
- OpenAI, Gemini, and FLUX through fal.ai. “Flex” was interpreted as FLUX; there is no separate Flex provider or arbitrary custom-provider URL feature in this release.
- A browser playground with provider/model/size/quality controls, prompt ideas, generation states, error feedback, and PNG download.
- A bearer-authenticated API using the same provider credentials, quota, and request ledger as the playground.
- A real usage dashboard with monthly counts, success rate, average duration, a daily chart, filters, and paginated history. No sample usage or estimated billing is presented as real.
- Account recovery with a one-time code, password changes, and account deletion with cascading data removal.
- SQLite persistence, backend integration tests, browser flows, accessibility checks, and CI.

## Pricing and starter limits

| Plan | Proposed price | Images / month | Status |
| --- | --- | --- | --- |
| Free | $0 | 100 | Available |
| Plus | $9/month | 2,000 | Preview only |
| Pro | $29/month | 10,000 | Preview only |
| Enterprise | Custom | Custom | Preview only |

**There are no payments, subscriptions, or paid plan upgrades.** Every account uses Free. Paid prices and features are explicitly labeled previews and do not activate anything. Provider charges are separate from the ImageAPI allowance.

Free allows 20 generation attempts per minute and two simultaneous generations per account. Playground and API use the same allowance. Calendar-month quotas reset at 00:00 UTC on the first day. Reservations are atomic, so concurrent requests cannot overspend the allowance. Successful, pending, and unknown-outcome requests count; failed requests do not. Requests abandoned by a terminated worker become `unknown` after five minutes when usage is viewed or another generation is attempted. They count conservatively because a provider may have completed them.

## Generate over the API

```bash
curl --fail-with-body http://127.0.0.1:8000/v1/images/generations \
  -H 'Authorization: Bearer YOUR_IMAGEAPI_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "A glass greenhouse floating over a pastel sea at sunrise",
    "provider": "openai",
    "model": "gpt-image-1",
    "size": "1024x1024",
    "quality": "auto"
  }' > response.json
```

```python
import base64
import json
from pathlib import Path

result = json.loads(Path("response.json").read_text())
Path("image.png").write_bytes(base64.b64decode(result["data"][0]["b64_json"]))
```

The response contains `id`, `created`, `provider`, `model`, and `data[0]` with `b64_json`, `mime_type`, `width`, and `height`. One PNG is returned per request; images are not hosted or retained. The legacy `/v1/images/generate` path is an authenticated alias with the **new JSON response contract**; it no longer returns raw PNG bytes or uses a server-wide OpenAI key.

| Option | Values |
| --- | --- |
| `prompt` | Required; 1–12,000 nonblank characters |
| `provider` | `openai` (default), `gemini`, `fal` |
| `model` | Defaults to the selected provider’s default; must be in `/api/catalog` |
| `size` | `1024x1024` (default), `1536x1024`, `1024x1536` |
| `quality` | `auto` (default); OpenAI also accepts `low`, `medium`, `high` |

Gemini maps size to aspect ratio (1:1, 3:2, 2:3); actual pixels depend on the model. Provider access, pricing, moderation, and model availability apply. Keys saved for one provider cannot authorize requests to another.

The provider adapters follow the official [OpenAI image API](https://platform.openai.com/docs/guides/image-generation), [Gemini GenerateContent image API](https://ai.google.dev/gemini-api/docs/generate-content/image-generation), and [fal FLUX synchronous API](https://fal.ai/models/fal-ai/flux/schnell/api). Supported IDs live in `app/providers/catalog.py` and can be updated as providers change availability. No live paid generation calls were made during development; protocol tests use mocked provider responses.

Generation has a bounded provider wait and no automatic retries or idempotency guarantee. A timeout does **not** prove the provider did no work. Check the provider’s usage before retrying to avoid duplicate charges. Provider errors are sanitized; failed generation responses include `X-Request-ID` after a reservation exists. `/docs` covers errors and server-side JavaScript/Python examples. `/openapi.json` provides the machine-readable API schema.

## Routes

| Route | Purpose |
| --- | --- |
| `/`, `/pricing`, `/docs` | Public frontend |
| `/signup`, `/login`, `/recover` | Account entry and recovery |
| `/dashboard`, `/api`, `/playground`, `/settings` | Authenticated frontend |
| `POST /api/auth/register`, `/login`, `/recover` | Authentication and recovery |
| `GET /api/auth/me` | Session user and CSRF token |
| `POST /api/auth/logout`, `/password` | End session or change password |
| `DELETE /api/auth/account` | Delete own account after password confirmation |
| `GET/POST /api/keys`, `DELETE /api/keys/{id}` | ImageAPI key lifecycle |
| `GET /api/providers`, `PUT/DELETE /api/providers/{id}` | Own provider credentials |
| `GET /api/usage` | Own usage, daily chart, request history |
| `GET /api/catalog`, `/api/plans` | Public model catalog and pricing |
| `POST /v1/images/generations` | Generate using an ImageAPI bearer key or CSRF-protected browser session |
| `POST /v1/images/transform` | Authenticated resize/conversion of uploaded images |
| `GET /health` | Process liveness; does not test provider readiness |

Bearer keys authorize image endpoints only. They cannot manage accounts, read provider settings, or view usage; those operations require a browser session. All modifying browser-session requests require `X-CSRF-Token`, obtained from register, login, or `/api/auth/me`. Cross-origin browser access is not enabled: call ImageAPI from your server, never embed secrets in client bundles.

The retained transformation endpoint accepts JPEG, PNG, and WebP up to 10 MiB and 20 million pixels. Optional width/height bounds (1–4096) preserve aspect ratio without upscaling. Output formats are `jpeg`, `png`, and `webp`; quality is 1–100. JPEG uses a white transparency background. Only the first animation frame is used; metadata is removed. Transformations are separate from AI image generation and are not counted as generated images.

## Configuration and persistence

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `IMAGEAPI_DATA_DIR` | `./data` | SQLite database and local encryption-key directory |
| `IMAGEAPI_PUBLIC_ORIGIN` | `http://127.0.0.1:8000` | Exact browser origin allowed to write |
| `IMAGEAPI_SECURE_COOKIES` | `false` | Set `true` behind HTTPS |
| `IMAGEAPI_ENCRYPTION_KEY` | Generated locally if absent | Fernet key for provider secrets |

`.env.example` contains placeholders. To use a `.env` file, explicitly run `uvicorn app.main:app --env-file .env ...`; otherwise export environment variables in your shell. User provider keys belong in account Settings, not `.env`.

SQLite uses WAL, foreign keys, indexed account history, and short atomic write transactions. The database file is owner-readable/writable. In local mode a private `data/encryption.key` is generated once and reused across restarts. Data directories, `.env`, test output, and credentials are ignored by Git.

**Back up the database and the encryption key securely.** Losing the encryption key means saved provider credentials must be re-entered. Changing the key is not an automatic rotation or migration. For deployment, inject a stable encryption key through a secret manager, keep it separate from database backups, use HTTPS and secure cookies, set the correct origin, and mount durable storage. Keep a stopped-server copy or use SQLite’s backup API; don’t copy a live database without accounting for WAL. This SQLite design targets a single application instance, not stateless multi-replica hosting.

There is no SMTP integration or email verification in this local release. Password recovery requires the code displayed at signup; recovery rotates the code and revokes every session and ImageAPI key. Password changes revoke sessions while leaving API keys intact. Account deletion removes rows from the active database; backup retention is the operator’s responsibility.

Prompts and image bytes are processed in memory and are not written to application storage. Usage logs contain only request metadata. AI providers process prompts under their own policies. No provider balance, token cost, or spending figure is fabricated in the dashboard.

## Code organization

```text
app/
  main.py              App factory and static frontend routes
  config.py            Runtime settings
  database.py          SQLite schema and transaction boundary
  security.py          Passwords, token hashes, encryption
  auth.py              Sessions, CSRF, bearer keys, rate limiting
  middleware.py        Origin checks, body limits, security headers
  errors.py            Validation error redaction
  generation.py        Generation validation and orchestration
  usage.py             Atomic reservations and outcomes
  providers/           Catalog and one adapter per provider
  routes/              Accounts, keys, dashboard, transforms
frontend/
  index.html           Buildless application shell
  assets/              Original SVG illustrations and favicon
  css/                 Tokens, base, components, marketing, workspace, auth
  js/core/             API client, router, state, forms, escaping
  js/components/       Layouts, icons, dialogs, chart, history, toasts
  js/pages/            One module per page; shared playground behavior
tests/
  test_*.py            Backend and protocol integration tests
  browser/             Playwright flows and isolated mocked-provider server
```

## Verification

```bash
source .venv/bin/activate
pytest -q
```

Optional browser and accessibility checks (Node.js 20+):

```bash
npm ci
npx playwright install chromium
npm run test:browser
```

If Chromium is already installed, set `IMAGEAPI_CHROMIUM_PATH=/usr/bin/chromium`. If Python is not at `.venv/bin/python`, set `IMAGEAPI_TEST_PYTHON` to its executable. Browser tests launch an isolated test-only server on port 8765, use a temporary database, and substitute deterministic images **only in that test server**. Normal `app.main:app` has no mock provider or fake-success mode. Tests make no paid generation calls.

The browser suite covers signup, one-time credentials, provider settings, generation/download, real usage updates, bearer requests, key creation/revocation, logout/login, recovery, responsive layouts, and automated WCAG checks. Backend tests cover isolation, encryption, auth/CSRF, concurrency, quota enforcement, provider protocols/errors, persistence, and image transformations. Formatting is available with `npm run format`; the frontend still runs directly without Node.js.

This release is for local evaluation. No public deployment, billing integration, team features, or custom provider endpoints are enabled.
