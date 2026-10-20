from fastapi.testclient import TestClient
from app.database import connect
from app.security import token_hash


def test_registration_session_and_secret_storage(client, app, account):
    assert account["api_key"].startswith("ia_live_")
    assert account["recovery_code"].startswith("iar_")
    assert client.cookies.get("imageapi_session")
    assert client.get("/api/auth/me").json()["user"]["email"] == "alex@example.com"
    with connect(app.state.settings.database) as db:
        row = db.execute("SELECT * FROM users").fetchone()
        assert row["password_hash"] != "a-safe-password-123"
        assert row["recovery_hash"] == token_hash(account["recovery_code"])
        assert db.execute("SELECT token_hash FROM api_keys").fetchone()[0] == token_hash(
            account["api_key"]
        )
    assert app.state.settings.database.stat().st_mode & 0o077 == 0


def test_cookie_flags(client):
    response = client.post(
        "/api/auth/register",
        json={"email": "cookie@example.com", "name": "Cookie", "password": "a-safe-password-123"},
    )
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie


def test_csrf_and_origin(client, account):
    client.headers.pop("X-CSRF-Token")
    assert client.post("/api/keys", json={"name": "key"}).status_code == 403
    client.headers["X-CSRF-Token"] = account["csrf"]
    assert (
        client.post(
            "/api/keys", json={"name": "key"}, headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "alex@example.com", "password": "a-safe-password-123"},
            headers={"Origin": "https://evil.example"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/keys", json={"name": "key"}, headers={"Origin": "http://testserver"}
        ).status_code
        == 201
    )


def test_login_logout(client, account):
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.post(
            "/api/auth/login", json={"email": "ALEX@example.com", "password": "wrong"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login", json={"email": "missing@example.com", "password": "wrong"}
        ).status_code
        == 401
    )
    response = client.post(
        "/api/auth/login", json={"email": "ALEX@example.com", "password": "a-safe-password-123"}
    )
    assert response.status_code == 200
    assert response.json()["csrf"] != account["csrf"]


def test_duplicate_and_weak_password(client, account):
    body = {"email": "alex@example.com", "name": "Alex", "password": "a-safe-password-123"}
    assert client.post("/api/auth/register", json=body).status_code == 409
    body["email"] = "other@example.com"
    body["password"] = "weak"
    assert client.post("/api/auth/register", json=body).status_code == 422


def test_provider_key_encrypted_and_never_returned(client, app, account):
    secret = "sk-a-unique-secret-test-value"
    assert client.put("/api/providers/openai", json={"api_key": secret}).status_code == 200
    listing = client.get("/api/providers")
    assert secret not in listing.text
    with connect(app.state.settings.database) as db:
        encrypted = db.execute("SELECT encrypted_key FROM provider_keys").fetchone()[0]
    assert secret not in encrypted
    assert app.state.cipher.decrypt(encrypted.encode()).decode() == secret
    assert client.delete("/api/providers/openai").status_code == 204
    assert client.get("/api/providers").json()["providers"][0]["connected"] is False


def test_cross_account_isolation(client, app, account):
    client.put("/api/providers/openai", json={"api_key": "sk-alex-private-key"})
    first_key = client.get("/api/keys").json()["keys"][0]["id"]
    with TestClient(app) as other:
        result = other.post(
            "/api/auth/register",
            json={"name": "Other", "email": "other@example.com", "password": "a-safe-password-456"},
        ).json()
        other.headers["X-CSRF-Token"] = result["csrf"]
        assert all(not p["connected"] for p in other.get("/api/providers").json()["providers"])
        assert other.get("/api/usage").json()["summary"]["requests"] == 0
        assert other.delete("/api/keys/" + first_key).status_code == 404
        assert all(k["id"] != first_key for k in other.get("/api/keys").json()["keys"])


def test_key_limit_and_revocation(client, app, account):
    app.state.settings.max_api_keys = 2
    response = client.post("/api/keys", json={"name": "Second"})
    assert response.status_code == 201
    assert client.post("/api/keys", json={"name": "Third"}).status_code == 409
    assert client.delete("/api/keys/" + response.json()["id"]).status_code == 204
    assert client.post("/api/keys", json={"name": "Replacement"}).status_code == 201
    assert "api_key" not in client.get("/api/keys").text


def test_password_change_revokes_sessions(client, account):
    assert (
        client.post(
            "/api/auth/password",
            json={"current_password": "bad", "new_password": "new-safe-password-123"},
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/auth/password",
            json={
                "current_password": "a-safe-password-123",
                "new_password": "new-safe-password-123",
            },
        ).status_code
        == 204
    )
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "alex@example.com", "password": "new-safe-password-123"},
        ).status_code
        == 200
    )


def test_recovery_rotates_code_and_revokes_all_access(client, account):
    body = {
        "email": "alex@example.com",
        "password": "new-safe-password-123",
        "recovery_code": account["recovery_code"],
    }
    response = client.post("/api/auth/recover", json=body)
    assert response.status_code == 200
    assert response.json()["recovery_code"] != account["recovery_code"]
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.post(
            "/v1/images/generations",
            json={"prompt": "cat"},
            headers={"Authorization": "Bearer " + account["api_key"]},
        ).status_code
        == 401
    )
    assert client.post("/api/auth/recover", json=body).status_code == 400
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "alex@example.com", "password": "new-safe-password-123"},
        ).status_code
        == 200
    )


def test_delete_account_cascades(client, app, account):
    client.put("/api/providers/openai", json={"api_key": "sk-private-user-key"})
    assert (
        client.request("DELETE", "/api/auth/account", json={"password": "bad"}).status_code == 400
    )
    assert (
        client.request(
            "DELETE", "/api/auth/account", json={"password": "a-safe-password-123"}
        ).status_code
        == 204
    )
    assert client.get("/api/auth/me").status_code == 401
    with connect(app.state.settings.database) as db:
        for table in ["users", "sessions", "api_keys", "provider_keys", "usage"]:
            assert db.execute("SELECT COUNT(*) FROM " + table).fetchone()[0] == 0


def test_auth_rate_limit(client):
    for _ in range(15):
        assert (
            client.post(
                "/api/auth/login", json={"email": "missing@example.com", "password": "wrong"}
            ).status_code
            == 401
        )
    response = client.post(
        "/api/auth/login", json={"email": "missing@example.com", "password": "wrong"}
    )
    assert response.status_code == 429
    assert "retry-after" in response.headers


def test_json_body_limit(client):
    assert (
        client.post(
            "/api/auth/login",
            content=b"x" * 1_048_577,
            headers={"Content-Type": "application/json"},
        ).status_code
        == 413
    )


def test_static_routes_and_security_headers(client):
    for path in [
        "/",
        "/pricing",
        "/login",
        "/signup",
        "/recover",
        "/dashboard",
        "/api",
        "/playground",
        "/settings",
        "/docs",
        "/static/js/app.js",
        "/static/css/base.css",
    ]:
        response = client.get(path)
        assert response.status_code == 200, path
        assert response.headers["x-frame-options"] == "DENY"
        assert "script-src 'self'" in response.headers["content-security-policy"]
    assert client.get("/not-a-real-page").status_code == 404
    assert client.get("/api/catalog").status_code == 200
    plans = client.get("/api/plans").json()["plans"]
    assert [p["id"] for p in plans if p["available"]] == ["free"]


def test_validation_never_echoes_passwords_or_provider_keys(client, account):
    secret = "bad secret with whitespace"
    response = client.put("/api/providers/openai", json={"api_key": secret})
    assert response.status_code == 422
    assert secret not in response.text
    response = client.post(
        "/api/auth/register", json={"email": "invalid", "password": "weak-secret", "name": "Alex"}
    )
    assert response.status_code == 422
    assert "weak-secret" not in response.text


def test_openapi_declares_bearer_auth(client):
    schema = client.get("/openapi.json").json()
    assert schema["components"]["securitySchemes"]["ImageAPIKey"]["scheme"] == "bearer"
    assert schema["paths"]["/v1/images/generations"]["post"]["security"] == [{"ImageAPIKey": []}]


def test_https_cookie_configuration(tmp_path):
    from app.config import Settings
    from app.main import create_app

    with TestClient(
        create_app(
            Settings(data_dir=tmp_path, public_origin="https://testserver", secure_cookies=True)
        ),
        base_url="https://testserver",
    ) as secure:
        response = secure.post(
            "/api/auth/register",
            json={"email": "secure@example.com", "name": "Alex", "password": "a-safe-password-123"},
        )
        assert "Secure" in response.headers["set-cookie"]
        assert "strict-transport-security" in response.headers
        assert secure.get("/api/auth/me").status_code == 200
