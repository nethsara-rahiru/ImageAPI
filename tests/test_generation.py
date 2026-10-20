import base64
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_missing_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert client.post("/v1/images/generate", json={"prompt": "A cat"}).status_code == 503


def test_generation(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-only")
    provider = AsyncMock()
    provider.images.generate.return_value = SimpleNamespace(data=[SimpleNamespace(b64_json=base64.b64encode(b"test-image").decode())])
    context = AsyncMock()
    context.__aenter__.return_value = provider
    monkeypatch.setattr("app.generation.AsyncOpenAI", lambda **kwargs: context)
    response = client.post("/v1/images/generate", json={"prompt": "A cat"})
    assert response.status_code == 200
    assert response.content == b"test-image"
    assert response.headers["content-type"] == "image/png"
    assert provider.images.generate.call_args.kwargs["prompt"] == "A cat"


def test_generation_validation():
    for body in [{"prompt": ""}, {"prompt": "   "}, {"prompt": "cat", "size": "42x42"}]:
        assert client.post("/v1/images/generate", json=body).status_code == 422


def test_empty_provider_response(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-only")
    provider = AsyncMock()
    provider.images.generate.return_value = SimpleNamespace(data=[])
    context = AsyncMock()
    context.__aenter__.return_value = provider
    monkeypatch.setattr("app.generation.AsyncOpenAI", lambda **kwargs: context)
    assert client.post("/v1/images/generate", json={"prompt": "cat"}).status_code == 502
