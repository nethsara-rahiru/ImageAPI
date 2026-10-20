from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.main import create_app


@pytest.fixture
def app(tmp_path):
    return create_app(Settings(data_dir=tmp_path, public_origin="http://testserver"))


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        yield client


@pytest.fixture
def account(client):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Alex Morgan",
            "email": "alex@example.com",
            "password": "a-safe-password-123",
        },
    )
    assert response.status_code == 201, response.text
    data = response.json()
    client.headers["X-CSRF-Token"] = data["csrf"]
    return data


@pytest.fixture
def png():
    output = BytesIO()
    Image.new("RGB", (32, 16), "skyblue").save(output, format="PNG")
    return output.getvalue()
