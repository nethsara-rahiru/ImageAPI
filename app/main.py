"""Image transformations without persistent storage or external services."""
from io import BytesIO
import warnings

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageOps, UnidentifiedImageError

app = FastAPI(title="ImageAPI", version="0.1.0", description="Generate AI images from prompts, or resize and convert uploads. Images are never stored.")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
FORMATS = {"jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/images/transform", responses={200: {"content": {mime: {} for mime in FORMATS.values()}}, 413: {"description": "Image exceeds processing limits"}, 415: {"description": "Unsupported or invalid image"}})
async def transform_image(
    file: UploadFile = File(...),
    width: int | None = Query(None, ge=1, le=4096),
    height: int | None = Query(None, ge=1, le=4096),
    format: str = Query("webp", pattern="^(jpeg|png|webp)$"),
    quality: int = Query(85, ge=1, le=100),
) -> Response:
    """Fit within width/height, preserving aspect ratio without upscaling.

    Accepts JPEG, PNG, and WebP. Animated inputs produce their first frame.
    EXIF orientation is applied; source metadata is removed from the output.
    """
    try:
        data = await file.read(MAX_UPLOAD_BYTES + 1)
    finally:
        await file.close()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Upload must be 10 MiB or smaller")
    if not data:
        raise HTTPException(400, "Upload is empty")

    # Keep CPU-bound decoding and encoding off the event loop.
    from starlette.concurrency import run_in_threadpool
    return await run_in_threadpool(_transform, data, width, height, format, quality)


def _transform(data: bytes, width: int | None, height: int | None, format: str, quality: int) -> Response:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as source:
                if source.format not in {"JPEG", "PNG", "WEBP"}:
                    raise HTTPException(415, "Supported input formats: JPEG, PNG, WebP")
                if source.width * source.height > MAX_PIXELS:
                    raise HTTPException(413, "Image must contain at most 20 million pixels")
                image = ImageOps.exif_transpose(source).convert("RGBA")
                image.thumbnail((width or image.width, height or image.height), Image.Resampling.LANCZOS)
                if format == "jpeg":
                    background = Image.new("RGB", image.size, "white")
                    background.paste(image, mask=image.getchannel("A"))
                    image = background
                image.info.clear()
                output = BytesIO()
                image.save(output, format=format.upper(), quality=quality)
                return Response(output.getvalue(), media_type=FORMATS[format], headers={
                    "Content-Disposition": f'inline; filename="image.{format}"',
                    "X-Image-Width": str(image.width),
                    "X-Image-Height": str(image.height),
                    "Cache-Control": "no-store",
                    "X-Content-Type-Options": "nosniff",
                })
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(413, "Image must contain at most 20 million pixels")
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(415, "Invalid or corrupt image")

from app.generation import router
app.include_router(router)
