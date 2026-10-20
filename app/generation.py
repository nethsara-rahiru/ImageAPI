"""Authenticated image generation using the caller's saved provider credential."""

import time
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from starlette.concurrency import run_in_threadpool

from app.auth import Principal, generation_user, rate_limit
from app.providers import generate
from app.providers.catalog import PROVIDERS
from app.routes.keys import read_provider_key
from app.usage import finish, reserve

router = APIRouter(tags=["Images"])


class GenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1, max_length=12000)
    provider: Literal["openai", "gemini", "fal"] = "openai"
    model: str | None = Field(None, max_length=120)
    size: Literal["1024x1024", "1536x1024", "1024x1536"] = "1024x1024"
    quality: Literal["auto", "low", "medium", "high"] = "auto"

    @field_validator("prompt")
    @classmethod
    def clean_prompt(cls, value):
        if not value.strip():
            raise ValueError("Prompt cannot be blank")
        return value.strip()

    @model_validator(mode="after")
    def validate_options(self):
        catalog = PROVIDERS[self.provider]
        self.model = self.model or catalog["default_model"]
        if self.model not in catalog["models"]:
            raise ValueError("Model is not supported by this provider; see /api/catalog")
        if self.quality not in catalog["qualities"]:
            raise ValueError("This provider supports quality=auto only")
        return self


@router.post("/v1/images/generations")
@router.post("/v1/images/generate", include_in_schema=False)
async def generate_image(
    body: GenerationRequest, request: Request, user: Annotated[Principal, Depends(generation_user)]
):
    """Generate one PNG. Authenticate with an ImageAPI bearer key.

    The account must have its own provider credential saved in Settings.
    Response data uses base64 PNG; images and prompts are never persisted.
    """
    settings = request.app.state.settings
    await run_in_threadpool(rate_limit, request, "generation:" + user.user_id, 20, 60)
    key = await run_in_threadpool(read_provider_key, request, user.user_id, body.provider)
    request_id = await run_in_threadpool(reserve, settings, user, body)
    start = time.monotonic()
    try:
        encoded, width, height = await generate(key, body)
    except HTTPException as exc:
        await run_in_threadpool(
            finish,
            settings,
            request_id,
            "failed",
            int((time.monotonic() - start) * 1000),
            str(exc.status_code),
        )
        exc.headers = {**(exc.headers or {}), "X-Request-ID": request_id}
        raise
    except Exception:
        await run_in_threadpool(
            finish,
            settings,
            request_id,
            "failed",
            int((time.monotonic() - start) * 1000),
            "internal_error",
        )
        raise HTTPException(
            500, "Generation failed unexpectedly", headers={"X-Request-ID": request_id}
        )
    await run_in_threadpool(
        finish, settings, request_id, "success", int((time.monotonic() - start) * 1000)
    )
    return {
        "id": request_id,
        "created": int(time.time()),
        "provider": body.provider,
        "model": body.model,
        "data": [{"b64_json": encoded, "mime_type": "image/png", "width": width, "height": height}],
    }
