"""OpenAI adapter. No environment-level fallback key is used."""

from openai import AsyncOpenAI, APIConnectionError, APIStatusError, APITimeoutError
from fastapi import HTTPException

from app.providers.errors import provider_status


async def generate(key, body):
    try:
        async with AsyncOpenAI(
            api_key=key, base_url="https://api.openai.com/v1", timeout=180, max_retries=0
        ) as client:
            result = await client.images.generate(
                model=body.model,
                prompt=body.prompt,
                size=body.size,
                quality=body.quality,
                n=1,
                output_format="png",
            )
        if not result.data or not result.data[0].b64_json:
            raise HTTPException(502, "Provider returned no image. Try another prompt")
        return result.data[0].b64_json, "image/png"
    except APITimeoutError:
        raise HTTPException(504, "Image generation timed out. Check provider usage before retrying")
    except APIConnectionError:
        raise HTTPException(503, "Could not connect to the image provider")
    except APIStatusError as exc:
        raise provider_status(exc.status_code)
