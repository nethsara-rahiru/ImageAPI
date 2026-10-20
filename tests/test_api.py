from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app

client = TestClient(app)


def upload(mode="RGBA", size=(120, 60), format="PNG"):
    stream = BytesIO()
    Image.new(mode, size, (255, 0, 0, 0) if mode == "RGBA" else "red").save(stream, format=format)
    return {"file": ("input.png", stream.getvalue(), "image/png")}


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("format", ["png", "jpeg", "webp"])
def test_resize_and_convert(format):
    response = client.post(f"/v1/images/transform?width=30&format={format}", files=upload())
    assert response.status_code == 200
    image = Image.open(BytesIO(response.content))
    assert image.size == (30, 15)
    assert image.format.lower() == format
    assert response.headers["cache-control"] == "no-store"
    if format == "jpeg":
        assert image.getpixel((0, 0)) == (255, 255, 255)


def test_fit_box_and_no_upscale():
    for query, expected in [("width=50&height=10", (20, 10)), ("width=400", (120, 60))]:
        response = client.post(f"/v1/images/transform?{query}", files=upload())
        assert Image.open(BytesIO(response.content)).size == expected


@pytest.mark.parametrize("query", ["width=0", "height=4097", "format=gif", "quality=101"])
def test_invalid_options(query):
    assert client.post(f"/v1/images/transform?{query}", files=upload()).status_code == 422


def test_invalid_and_empty_uploads():
    for content, status in [(b"not an image", 415), (b"", 400)]:
        assert client.post("/v1/images/transform", files={"file": ("x.png", content)}).status_code == status


def test_size_limits(monkeypatch):
    monkeypatch.setattr("app.main.MAX_UPLOAD_BYTES", 10)
    assert client.post("/v1/images/transform", files=upload()).status_code == 413


def test_pixel_limit(monkeypatch):
    monkeypatch.setattr("app.main.MAX_PIXELS", 100)
    assert client.post("/v1/images/transform", files=upload()).status_code == 413


def test_unsupported_input():
    assert client.post("/v1/images/transform", files=upload(mode="RGB", format="BMP")).status_code == 415
