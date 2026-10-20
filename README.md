# ImageAPI

A FastAPI starter for AI image generation using OpenAI, with optional image resizing and conversion. Image data is returned directly; uploads and generated images are not stored.

## Run locally

Requires Python 3.11 or later.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
export OPENAI_API_KEY='your-key'
# Optional: override the default gpt-image-1 model
export OPENAI_IMAGE_MODEL='gpt-image-1'
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/docs for the interactive API interface. The key stays on the server. `.env.example` documents settings; `.env` files are not automatically loaded.

## Generate an image

```bash
curl --fail-with-body http://127.0.0.1:8000/v1/images/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"A watercolor painting of a lighthouse at sunrise","size":"1024x1024","quality":"low"}' \
  --output generated.png
```

Returns a PNG. Sizes: `1024x1024`, `1536x1024`, `1024x1536`, `auto`. Quality: `low`, `medium`, `high`, `auto`. Each request generates one image and incurs provider charges. Requires an OpenAI account with access and quota for the selected image model. Missing configuration returns 503; provider errors return a sanitized error without exposing credentials.

## Transform an existing image

```bash
curl --fail-with-body 'http://127.0.0.1:8000/v1/images/transform?width=800&format=webp&quality=85' \
  -F 'file=@photo.png' --output resized.webp
```

Accepts JPEG, PNG, and WebP up to 10 MiB and 20 million pixels. Width and height are optional bounds from 1 to 4096; aspect ratio is preserved and images are not enlarged. Output formats: `jpeg`, `png`, `webp`. Transparency is flattened onto white for JPEG. Animation uses the first frame; metadata is removed.

`GET /health` reports process health, not provider readiness.

## Test

```bash
pytest -q
```

Tests mock image generation; no paid API calls are made. Before exposing this starter publicly, add authentication, per-user quotas/rate limits, and request/concurrency limits at your gateway to control generation costs and resource use. It currently runs locally without authentication.
