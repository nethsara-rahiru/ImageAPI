"""Isolated browser-test server. Never use this module for normal operation."""

import asyncio
import base64
import tempfile
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw

import app.generation
from app.config import Settings
from app.main import create_app

_runtime = tempfile.TemporaryDirectory(prefix="imageapi-browser-")


async def test_provider(key, body):
    """Deterministic image fixture; no network, provider credentials, or charges."""
    await asyncio.sleep(0.1)
    image = Image.new("RGB", (256, 256), "#b9e2f2")
    draw = ImageDraw.Draw(image)
    draw.ellipse((95, 40, 205, 150), fill="#efb5be")
    draw.polygon([(0, 210), (140, 155), (256, 200), (256, 256), (0, 256)], fill="#edc3a4")
    output = BytesIO()
    image.save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode(), 256, 256


app.generation.generate = test_provider
app = create_app(Settings(data_dir=Path(_runtime.name), public_origin="http://127.0.0.1:8765"))
