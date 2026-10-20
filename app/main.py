"""Application factory and frontend delivery. Run with uvicorn app.main:app."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.config import Settings
from app.errors import validation_error
from app.middleware import security_middleware
from app.database import initialize
from app.security import load_cipher
from app.generation import router as images
from app.routes import accounts, dashboard, keys, transforms

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        initialize(settings.database)
        app.state.cipher = load_cipher(settings)
        yield

    app = FastAPI(
        title="ImageAPI",
        version="0.2.0",
        description="One API for image generation with your own provider keys.",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
    )
    app.state.settings = settings
    app.add_exception_handler(RequestValidationError, validation_error)

    app.middleware("http")(security_middleware(settings))

    app.include_router(accounts.router)
    app.include_router(keys.router)
    app.include_router(dashboard.router)
    app.include_router(images)
    app.include_router(transforms.router)

    @app.get("/health", tags=["System"])
    def health():
        return {"status": "ok", "version": "0.2.0"}

    @app.get("/api/reference", include_in_schema=False)
    def reference():
        return RedirectResponse("/docs")

    app.mount("/static", StaticFiles(directory=FRONTEND), name="static")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path not in {
            "",
            "pricing",
            "login",
            "signup",
            "recover",
            "dashboard",
            "api",
            "playground",
            "settings",
            "docs",
        }:
            raise HTTPException(404, "Page not found")
        return FileResponse(FRONTEND / "index.html", headers={"Cache-Control": "no-cache"})

    return app


app = create_app()
