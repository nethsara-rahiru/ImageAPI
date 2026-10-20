"""Server-side OpenAI image generation."""
import base64
import os
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from openai import AsyncOpenAI, APIConnectionError, APIStatusError, APITimeoutError, RateLimitError
from pydantic import BaseModel, Field

router = APIRouter()


class GenerationRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=32000)
    size: Literal["1024x1024", "1536x1024", "1024x1536", "auto"] = "1024x1024"
    quality: Literal["low", "medium", "high", "auto"] = "auto"


@router.post("/v1/images/generate", response_class=Response, responses={200: {"content": {"image/png": {}}}, 503: {"description": "Provider not configured or unavailable"}})
async def generate_image(request: GenerationRequest) -> Response:
    """Generate one PNG from a prompt. Requires server-side OPENAI_API_KEY.

    Calls incur charges on the configured OpenAI account.
    """
    if not request.prompt.strip():
        raise HTTPException(422, "Prompt cannot be blank")
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(503, "Set OPENAI_API_KEY on the server to enable generation")
    try:
        async with AsyncOpenAI(timeout=180.0, max_retries=0) as client:
            result = await client.images.generate(
                model=os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1"),
                prompt=request.prompt.strip(), size=request.size,
                quality=request.quality, n=1, output_format="png",
            )
        if not result.data or not result.data[0].b64_json:
            raise HTTPException(502, "Image provider returned no image")
        content = base64.b64decode(result.data[0].b64_json, validate=True)
    except RateLimitError:
        raise HTTPException(429, "Image provider rate limit or quota exceeded")
    except APITimeoutError:
        raise HTTPException(504, "Image generation timed out")
    except APIConnectionError:
        raise HTTPException(503, "Image provider is unavailable")
    except APIStatusError as exc:
        if exc.status_code == 400:
            raise HTTPException(400, "Image provider rejected the request; try another prompt or settings")
        raise HTTPException(502, "Image provider request failed")
    except (ValueError, TypeError):
        raise HTTPException(502, "Image provider returned invalid image data")
    return Response(content, media_type="image/png", headers={
        "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="generated.png"',
        "X-Content-Type-Options": "nosniff",
    })
