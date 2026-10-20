"""Passwords, opaque tokens and encryption at rest."""

import base64
import hashlib
import hmac
import os
import secrets

from cryptography.fernet import Fernet

from app.config import Settings


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
    return base64.b64encode(salt + digest).decode()


def password_matches(password: str, stored: str) -> bool:
    try:
        raw = base64.b64decode(stored)
        digest = hashlib.scrypt(password.encode(), salt=raw[:16], n=16384, r=8, p=1)
        return hmac.compare_digest(raw[16:], digest)
    except (ValueError, TypeError):
        return False


def load_cipher(settings: Settings) -> Fernet:
    if settings.encryption_key:
        return Fernet(settings.encryption_key.encode())
    path = settings.data_dir / "encryption.key"
    settings.data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists():
        return Fernet(path.read_bytes())
    # Publish a fully written key atomically, including concurrent worker startup.
    temporary = path.with_name(".encryption-" + secrets.token_hex(12) + ".tmp")
    key = Fernet.generate_key()
    fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(key)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            pass
    finally:
        temporary.unlink(missing_ok=True)
    return Fernet(path.read_bytes())
