"""Gemini GenerateContent adapter; dimensions map to aspect ratios."""

import httpx
from fastapi import HTTPException
from app.providers.errors import provider_status


async def generate(key, body):
    aspect = {"1024x1024": "1:1", "1536x1024": "3:2", "1024x1536": "2:3"}[body.size]
    async with httpx.AsyncClient(timeout=180, follow_redirects=False) as client:
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{body.model}:generateContent",
            headers={"x-goog-api-key": key},
            json={
                "contents": [{"parts": [{"text": body.prompt}]}],
                "generationConfig": {
                    "responseModalities": ["TEXT", "IMAGE"],
                    "imageConfig": {"aspectRatio": aspect},
                },
            },
        )
    if response.status_code != 200:
        raise provider_status(response.status_code)
    result = response.json()
    for candidate in result.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            image = part.get("inlineData", {})
            if image.get("data"):
                return image["data"], image.get("mimeType", "image/png")
    raise HTTPException(
        422, "Provider returned no image. The prompt may have been filtered; try a different prompt"
    )
