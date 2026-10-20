import asyncio
import base64
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from PIL import Image

from app.generation import GenerationRequest
from app.providers import fal, gemini, openai, normalize_image
from app.providers.errors import provider_status


def intercept_http(monkeypatch, handler):
    real = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs),
    )


def test_openai_adapter_passes_user_key_and_parameters(monkeypatch, png):
    provider = AsyncMock()
    provider.images.generate.return_value = SimpleNamespace(
        data=[SimpleNamespace(b64_json=base64.b64encode(png).decode())]
    )
    context = AsyncMock()
    context.__aenter__.return_value = provider
    kwargs_seen = {}

    def factory(**kwargs):
        kwargs_seen.update(kwargs)
        return context

    monkeypatch.setattr(openai, "AsyncOpenAI", factory)
    body = GenerationRequest(prompt="A cat", size="1536x1024", quality="low")
    encoded, mime = asyncio.run(openai.generate("my-user-key", body))
    assert base64.b64decode(encoded) == png
    assert mime == "image/png"
    assert kwargs_seen["api_key"] == "my-user-key"
    assert kwargs_seen["max_retries"] == 0
    assert provider.images.generate.call_args.kwargs["quality"] == "low"


def test_gemini_protocol(monkeypatch, png):
    import json

    def handler(request):
        assert request.url.host == "generativelanguage.googleapis.com"
        assert request.headers["x-goog-api-key"] == "user-gemini-key"
        assert request.url.path.endswith("gemini-2.5-flash-image:generateContent")
        body = json.loads(request.content)
        assert body["generationConfig"]["imageConfig"]["aspectRatio"] == "3:2"
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "inlineData": {
                                        "data": base64.b64encode(png).decode(),
                                        "mimeType": "image/png",
                                    }
                                }
                            ]
                        }
                    }
                ]
            },
        )

    intercept_http(monkeypatch, handler)
    data, mime = asyncio.run(
        gemini.generate(
            "user-gemini-key",
            GenerationRequest(prompt="A cat", provider="gemini", size="1536x1024"),
        )
    )
    assert base64.b64decode(data) == png


def test_fal_protocol_no_arbitrary_image_fetch(monkeypatch, png):
    import json

    def handler(request):
        assert str(request.url) == "https://fal.run/fal-ai/flux/schnell"
        assert request.headers["Authorization"] == "Key user-fal-key"
        body = json.loads(request.content)
        assert body["sync_mode"] is True
        assert body["image_size"] == {"width": 1024, "height": 1536}
        return httpx.Response(
            200,
            json={"images": [{"url": "data:image/png;base64," + base64.b64encode(png).decode()}]},
        )

    intercept_http(monkeypatch, handler)
    data, mime = asyncio.run(
        fal.generate(
            "user-fal-key", GenerationRequest(prompt="A cat", provider="fal", size="1024x1536")
        )
    )
    assert base64.b64decode(data) == png


def test_fal_rejects_remote_url(monkeypatch):
    intercept_http(
        monkeypatch,
        lambda _: httpx.Response(200, json={"images": [{"url": "http://169.254.169.254/private"}]}),
    )
    with pytest.raises(HTTPException) as error:
        asyncio.run(fal.generate("key", GenerationRequest(prompt="cat", provider="fal")))
    assert error.value.status_code == 502


@pytest.mark.parametrize(
    "status,expected",
    [(401, 424), (403, 424), (429, 429), (400, 400), (404, 400), (422, 400), (500, 502)],
)
def test_sanitized_provider_status(status, expected):
    assert provider_status(status).status_code == expected


def test_normalize_removes_metadata(png):
    encoded, width, height = normalize_image(base64.b64encode(png).decode())
    image = Image.open(BytesIO(base64.b64decode(encoded)))
    assert image.format == "PNG" and image.size == (32, 16)
    assert image.info == {}


def test_normalize_rejects_invalid_image():
    with pytest.raises(Exception):
        normalize_image(base64.b64encode(b"not an image").decode())


def test_dispatch_sanitizes_invalid_response(monkeypatch):
    from app import providers

    async def invalid(*_):
        return "not-base64", "image/png"

    monkeypatch.setitem(providers.ADAPTERS, "openai", invalid)
    with pytest.raises(HTTPException) as error:
        asyncio.run(providers.generate("key", GenerationRequest(prompt="cat")))
    assert error.value.status_code == 502


def test_gemini_filters_no_image(monkeypatch):
    intercept_http(monkeypatch, lambda _: httpx.Response(200, json={"candidates": []}))
    with pytest.raises(HTTPException) as error:
        asyncio.run(gemini.generate("key", GenerationRequest(prompt="cat", provider="gemini")))
    assert error.value.status_code == 422


def test_data_persists_across_application_restarts(client, account, app):
    from fastapi.testclient import TestClient
    from app.main import create_app

    client.put("/api/providers/openai", json={"api_key": "sk-persistent-key"})
    with TestClient(create_app(app.state.settings)) as second:
        login = second.post(
            "/api/auth/login", json={"email": "alex@example.com", "password": "a-safe-password-123"}
        ).json()
        second.headers["X-CSRF-Token"] = login["csrf"]
        assert second.get("/api/providers").json()["providers"][0]["connected"]
        from app.routes.keys import read_provider_key

        request = SimpleNamespace(app=second.app)
        assert read_provider_key(request, account["user"]["id"], "openai") == "sk-persistent-key"
