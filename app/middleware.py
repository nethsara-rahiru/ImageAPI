"""Same-origin browser requests, bounded request bodies, and response headers."""

from fastapi import Request
from fastapi.responses import JSONResponse

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; "
        "base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'"
    ),
}


def security_middleware(settings):
    async def middleware(request: Request, call_next):
        response = None
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            if (origin and origin != settings.public_origin) or request.headers.get(
                "sec-fetch-site"
            ) == "cross-site":
                response = JSONResponse(
                    {"detail": "Cross-origin requests are not allowed"}, status_code=403
                )
        limit = (
            11 * 1024 * 1024
            if request.url.path == "/v1/images/transform"
            else settings.request_limit
        )
        length = request.headers.get("content-length")
        if response is None and length:
            try:
                if int(length) > limit or int(length) < 0:
                    response = JSONResponse(
                        {"detail": "Request body is too large"}, status_code=413
                    )
            except ValueError:
                response = JSONResponse({"detail": "Invalid Content-Length"}, status_code=400)
        if response is None and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > limit:
                    response = JSONResponse(
                        {"detail": "Request body is too large"}, status_code=413
                    )
                    break
            if response is None:
                request._body = bytes(body)
        if response is None:
            response = await call_next(request)
        for name, value in SECURITY_HEADERS.items():
            response.headers[name] = value
        if settings.secure_cookies:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        if request.url.path.startswith(("/api/", "/v1/")):
            response.headers["Cache-Control"] = "no-store"
        return response

    return middleware
