from fastapi import HTTPException


def provider_status(status: int):
    if status in (401, 403):
        return HTTPException(
            424, "Provider rejected your key or model access. Check it in Settings"
        )
    if status == 429:
        return HTTPException(
            429,
            "Provider quota or rate limit exceeded. Check your provider account",
            headers={"Retry-After": "60"},
        )
    if status in (400, 404, 422):
        return HTTPException(
            400, "Provider rejected the prompt, model, or settings. Try different options"
        )
    return HTTPException(502, "The image provider is temporarily unavailable")
