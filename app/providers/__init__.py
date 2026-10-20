"""Provider dispatch and safe output normalization."""

import asyncio
import base64
from io import BytesIO
import warnings

import httpx
from fastapi import HTTPException
from PIL import Image
from starlette.concurrency import run_in_threadpool

from app.providers import fal, gemini, openai

ADAPTERS = {"openai": openai.generate, "gemini": gemini.generate, "fal": fal.generate}


async def generate(key, body):
    try:
        async with asyncio.timeout(185):
            encoded, mime = await ADAPTERS[body.provider](key, body)
        return await run_in_threadpool(normalize_image, encoded)
    except (httpx.TimeoutException, TimeoutError):
        raise HTTPException(504, "Image generation timed out. Check provider usage before retrying")
    except httpx.HTTPError:
        raise HTTPException(503, "Could not connect to the image provider")
    except (
        ValueError,
        KeyError,
        TypeError,
        OSError,
        IndexError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise HTTPException(502, "Provider returned invalid image data")


def normalize_image(encoded):
    if len(encoded) > 28_000_000:
        raise HTTPException(502, "Provider image exceeds the output size limit")
    raw = base64.b64decode(encoded, validate=True)
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(BytesIO(raw)) as image:
            if image.width * image.height > 20_000_000:
                raise ValueError("Too many pixels")
            # Normalize provider output to a verified PNG, without source metadata.
            image.load()
            clean = image.convert("RGBA")
            clean.info.clear()
            output = BytesIO()
            clean.save(output, format="PNG")
            return base64.b64encode(output.getvalue()).decode(), image.width, image.height
