import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException

from app.database import connect


def connect_provider(client, provider="openai", key="sk-user-only-test"):
    response = client.put("/api/providers/" + provider, json={"api_key": key})
    assert response.status_code == 200


@pytest.fixture
def mock_generation(monkeypatch, png):
    calls = []

    async def generate(key, body):
        calls.append((key, body))
        return base64.b64encode(png).decode(), 32, 16

    monkeypatch.setattr("app.generation.generate", generate)
    return calls


def test_requires_auth(client):
    assert client.post("/v1/images/generations", json={"prompt": "cat"}).status_code == 401
    assert client.post("/v1/images/transform", files={"file": ("x", b"test")}).status_code == 401


def test_requires_own_provider_key(client, account, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "platform-key-must-not-be-used")
    assert client.post("/v1/images/generations", json={"prompt": "cat"}).status_code == 409
    assert client.get("/api/usage").json()["summary"]["requests"] == 0


def test_playground_and_bearer_usage(client, account, mock_generation):
    connect_provider(client)
    response = client.post("/v1/images/generations", json={"prompt": " A cat "})
    assert response.status_code == 200, response.text
    assert response.json()["data"][0]["width"] == 32
    response = client.post(
        "/v1/images/generations",
        headers={"Authorization": "Bearer " + account["api_key"]},
        json={"prompt": "Landscape"},
    )
    assert response.status_code == 200
    assert mock_generation[0][0] == "sk-user-only-test"
    assert mock_generation[0][1].prompt == "A cat"
    usage = client.get("/api/usage").json()
    assert usage["summary"]["images"] == 2
    assert usage["summary"]["requests"] == 2
    assert {row["source"] for row in usage["requests"]} == {"api", "playground"}
    assert sum(day["count"] for day in usage["daily"]) == 2
    assert all("prompt" not in row for row in usage["requests"])


@pytest.mark.parametrize(
    "body",
    [
        {"prompt": ""},
        {"prompt": "   "},
        {"prompt": "cat", "size": "42x42"},
        {"prompt": "cat", "model": "bad"},
        {"prompt": "cat", "provider": "gemini", "quality": "high"},
        {"prompt": "cat", "provider": "bad"},
    ],
)
def test_validation(client, account, body):
    assert client.post("/v1/images/generations", json=body).status_code == 422


def test_failed_generation_is_recorded_not_billed_to_quota(client, account, monkeypatch):
    connect_provider(client)

    async def failure(*args):
        raise HTTPException(424, "Provider key rejected")

    monkeypatch.setattr("app.generation.generate", failure)
    response = client.post("/v1/images/generations", json={"prompt": "cat"})
    assert response.status_code == 424
    assert response.headers["X-Request-ID"].startswith("req_")
    usage = client.get("/api/usage").json()
    assert usage["summary"]["used"] == 0
    assert usage["summary"]["failed"] == 1
    assert usage["requests"][0]["error_code"] == "424"


def test_monthly_limit(client, app, account, mock_generation):
    app.state.settings.free_limit = 2
    connect_provider(client)
    for _ in range(2):
        assert client.post("/v1/images/generations", json={"prompt": "cat"}).status_code == 200
    assert client.post("/v1/images/generations", json={"prompt": "cat"}).status_code == 429
    assert len(mock_generation) == 2


def test_concurrent_quota_is_atomic(client, app, account, monkeypatch, png):
    app.state.settings.free_limit = 1
    connect_provider(client)

    async def slow(*args):
        await asyncio.sleep(0.3)
        return base64.b64encode(png).decode(), 32, 16

    monkeypatch.setattr("app.generation.generate", slow)
    with ThreadPoolExecutor(max_workers=3) as pool:
        statuses = list(
            pool.map(
                lambda _: client.post("/v1/images/generations", json={"prompt": "cat"}).status_code,
                range(3),
            )
        )
    assert sorted(statuses) == [200, 429, 429]
    assert client.get("/api/usage").json()["summary"]["used"] == 1


def test_bearer_does_not_need_csrf_but_cannot_manage_account(client, account, mock_generation):
    connect_provider(client)
    client.cookies.clear()
    client.headers.pop("X-CSRF-Token", None)
    headers = {"Authorization": "Bearer " + account["api_key"]}
    assert (
        client.post("/v1/images/generations", json={"prompt": "cat"}, headers=headers).status_code
        == 200
    )
    assert client.get("/api/providers", headers=headers).status_code == 401
    assert client.post("/api/keys", json={"name": "hack"}, headers=headers).status_code == 401


def test_revoked_key_cannot_generate(client, account, mock_generation):
    connect_provider(client)
    key = client.get("/api/keys").json()["keys"][0]
    assert client.delete("/api/keys/" + key["id"]).status_code == 204
    assert (
        client.post(
            "/v1/images/generations",
            headers={"Authorization": "Bearer " + account["api_key"]},
            json={"prompt": "cat"},
        ).status_code
        == 401
    )
    assert not mock_generation


def test_interrupted_request_becomes_unknown_and_keeps_quota(client, app, account, mock_generation):
    import time
    from app.auth import Principal
    from app.generation import GenerationRequest
    from app.usage import reserve

    connect_provider(client)
    request_id = reserve(
        app.state.settings, Principal(account["user"]["id"]), GenerationRequest(prompt="cat")
    )
    with connect(app.state.settings.database, write=True) as db:
        db.execute("UPDATE usage SET created_at=? WHERE id=?", (int(time.time()) - 400, request_id))
    usage = client.get("/api/usage").json()
    assert usage["requests"][0]["status"] == "unknown"
    assert usage["summary"]["used"] == 1
    assert client.post("/v1/images/generations", json={"prompt": "cat"}).status_code == 200


def test_unsupported_fields_are_not_silently_ignored(client, account):
    response = client.post("/v1/images/generations", json={"prompt": "cat", "n": 10})
    assert response.status_code == 422
