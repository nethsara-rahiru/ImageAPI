"""Runtime configuration; local data is kept outside the source tree."""

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("IMAGEAPI_DATA_DIR", "./data")))
    secure_cookies: bool = field(
        default_factory=lambda: os.getenv("IMAGEAPI_SECURE_COOKIES", "false").lower() == "true"
    )
    public_origin: str = field(
        default_factory=lambda: os.getenv("IMAGEAPI_PUBLIC_ORIGIN", "http://127.0.0.1:8000").rstrip(
            "/"
        )
    )
    encryption_key: str | None = field(default_factory=lambda: os.getenv("IMAGEAPI_ENCRYPTION_KEY"))
    session_days: int = 7
    free_limit: int = 100
    max_api_keys: int = 10
    concurrent_generations: int = 2
    request_limit: int = 1_048_576

    def __post_init__(self):
        parsed = urlsplit(self.public_origin)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.path
            or parsed.query
            or parsed.fragment
            or parsed.username
            or parsed.password
        ):
            raise ValueError("IMAGEAPI_PUBLIC_ORIGIN must be an HTTP(S) origin without a path")
        if self.secure_cookies and parsed.scheme != "https":
            raise ValueError("Secure cookies require an HTTPS public origin")

    @property
    def database(self) -> Path:
        return self.data_dir / "imageapi.sqlite3"
