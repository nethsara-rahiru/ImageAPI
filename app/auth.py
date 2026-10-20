"""Account sessions, CSRF checks and scoped ImageAPI bearer keys."""

import hmac
import secrets
import time
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.database import connect
from app.security import token_hash

COOKIE = "imageapi_session"
BEARER = HTTPBearer(
    auto_error=False,
    scheme_name="ImageAPIKey",
    description="An ImageAPI key from your account. Browser sessions may use a CSRF-protected cookie instead.",
)


@dataclass
class Principal:
    user_id: str
    key_id: str | None = None
    csrf: str | None = None


def session_user(request: Request) -> Principal:
    token = request.cookies.get(COOKIE, "")
    with connect(request.app.state.settings.database) as db:
        row = db.execute(
            "SELECT * FROM sessions WHERE token_hash=? AND expires_at>?",
            (token_hash(token), int(time.time())),
        ).fetchone()
    if not row:
        raise HTTPException(401, "Please sign in to continue")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        if not hmac.compare_digest(request.headers.get("X-CSRF-Token", ""), row["csrf"]):
            raise HTTPException(403, "Session check failed. Refresh the page and try again")
    return Principal(row["user_id"], csrf=row["csrf"])


def generation_user(
    request: Request, credential: Annotated[HTTPAuthorizationCredentials | None, Depends(BEARER)]
) -> Principal:
    authorization = request.headers.get("Authorization")
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token.startswith("ia_live_") or len(token) > 200:
            raise HTTPException(401, "Invalid ImageAPI key", headers={"WWW-Authenticate": "Bearer"})
        with connect(request.app.state.settings.database, write=True) as db:
            row = db.execute(
                "SELECT id, user_id FROM api_keys WHERE token_hash=? AND revoked_at IS NULL",
                (token_hash(token),),
            ).fetchone()
            if not row:
                raise HTTPException(
                    401, "Invalid or revoked ImageAPI key", headers={"WWW-Authenticate": "Bearer"}
                )
            db.execute(
                "UPDATE api_keys SET last_used_at=? WHERE id=?", (int(time.time()), row["id"])
            )
        return Principal(row["user_id"], key_id=row["id"])
    return session_user(request)


def issue_api_key(db, user_id: str, name: str) -> tuple[str, str]:
    token = "ia_live_" + secrets.token_urlsafe(32)
    key_id = secrets.token_hex(12)
    db.execute(
        "INSERT INTO api_keys (id,user_id,name,token_hash,prefix,created_at) VALUES (?,?,?,?,?,?)",
        (key_id, user_id, name, token_hash(token), token[:15] + "…" + token[-4:], int(time.time())),
    )
    return key_id, token


def issue_session(db, user_id: str, settings) -> tuple[str, str]:
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    now = int(time.time())
    db.execute("DELETE FROM sessions WHERE expires_at<=?", (now,))
    db.execute(
        "INSERT INTO sessions VALUES (?,?,?,?)",
        (token_hash(token), user_id, csrf, now + settings.session_days * 86400),
    )
    return token, csrf


def set_session_cookie(response, token: str, settings) -> None:
    response.set_cookie(
        COOKIE,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/",
    )


def rate_limit(request: Request, bucket: str, limit: int, window: int) -> None:
    now = int(time.time())
    with connect(request.app.state.settings.database, write=True) as db:
        db.execute("DELETE FROM rate_limits WHERE resets_at<=?", (now,))
        row = db.execute(
            "SELECT count,resets_at FROM rate_limits WHERE bucket=?", (bucket,)
        ).fetchone()
        if row and row["count"] >= limit:
            raise HTTPException(
                429,
                "Too many requests. Try again shortly",
                headers={"Retry-After": str(row["resets_at"] - now)},
            )
        db.execute(
            "INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1",
            (bucket, now + window),
        )
