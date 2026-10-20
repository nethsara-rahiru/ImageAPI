"""FLUX via fal's synchronous endpoint. Data URIs avoid arbitrary URL fetching."""

import httpx
from fastapi import HTTPException
from app.providers.errors import provider_status


async def generate(key, body):
    width, height = map(int, body.size.split("x"))
    async with httpx.AsyncClient(timeout=180, follow_redirects=False) as client:
        response = await client.post(
            f"https://fal.run/{body.model}",
            headers={"Authorization": "Key " + key},
            json={
                "prompt": body.prompt,
                "image_size": {"width": width, "height": height},
                "num_images": 1,
                "sync_mode": True,
                "output_format": "png",
            },
        )
    if response.status_code != 200:
        raise provider_status(response.status_code)
    images = response.json().get("images", [])
    uri = images[0].get("url", "") if images else ""
    if not uri.startswith("data:image/") or ";base64," not in uri:
        raise HTTPException(502, "Provider did not return inline image data")
    header, encoded = uri.split(",", 1)
    return encoded, header.removeprefix("data:").split(";")[0]
