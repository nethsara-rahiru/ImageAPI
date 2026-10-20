"""Registration, login, recovery and account lifecycle."""

import secrets
import sqlite3
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.auth import (
    COOKIE,
    Principal,
    issue_api_key,
    issue_session,
    rate_limit,
    session_user,
    set_session_cookie,
)
from app.database import connect
from app.security import password_hash, password_matches, token_hash

router = APIRouter(prefix="/api/auth", tags=["Accounts"])
User = Annotated[Principal, Depends(session_user)]


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return value.lower()


class Registration(Credentials):
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value):
        if not value.strip():
            raise ValueError("Name cannot be blank")
        return value.strip()


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class Recovery(Credentials):
    recovery_code: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=12, max_length=128)


class Confirmation(BaseModel):
    password: str = Field(min_length=1, max_length=128)


def public_user(row):
    return {key: row[key] for key in ("id", "name", "email", "plan", "created_at")}


def auth_limit(request, email):
    # Client IP is read from the socket, never an untrusted forwarded header.
    ip = request.client.host if request.client else "unknown"
    rate_limit(request, "auth-ip:" + token_hash(ip), 30, 900)
    rate_limit(request, "auth-account:" + token_hash(email), 15, 900)


@router.post("/register", status_code=201)
def register(body: Registration, request: Request, response: Response):
    auth_limit(request, body.email)
    settings = request.app.state.settings
    user_id, recovery = secrets.token_hex(16), "iar_" + secrets.token_urlsafe(32)
    encoded_password = password_hash(body.password)
    try:
        with connect(settings.database, write=True) as db:
            db.execute(
                "INSERT INTO users(id,email,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)",
                (
                    user_id,
                    body.email,
                    body.name,
                    encoded_password,
                    token_hash(recovery),
                    int(time.time()),
                ),
            )
            _, api_key = issue_api_key(db, user_id, "Default key")
            token, csrf = issue_session(db, user_id, settings)
            user = public_user(db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())
    except sqlite3.IntegrityError:
        raise HTTPException(409, "An account with that email already exists")
    set_session_cookie(response, token, settings)
    return {"user": user, "csrf": csrf, "api_key": api_key, "recovery_code": recovery}


@router.post("/login")
def login(body: Credentials, request: Request, response: Response):
    auth_limit(request, body.email)
    settings = request.app.state.settings
    with connect(settings.database) as db:
        row = db.execute("SELECT * FROM users WHERE email=?", (body.email,)).fetchone()
    # Perform scrypt even for unknown accounts to avoid a cheap timing oracle.
    valid = password_matches(
        body.password, row["password_hash"] if row else "AAAAAAAAAAAAAAAAAAAAAA=="
    )
    if not row or not valid:
        raise HTTPException(401, "Email or password is incorrect")
    with connect(settings.database, write=True) as db:
        token, csrf = issue_session(db, row["id"], settings)
    set_session_cookie(response, token, settings)
    return {"user": public_user(row), "csrf": csrf}


@router.get("/me")
def me(request: Request, user: User):
    with connect(request.app.state.settings.database) as db:
        row = db.execute("SELECT * FROM users WHERE id=?", (user.user_id,)).fetchone()
    return {"user": public_user(row), "csrf": user.csrf}


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, user: User):
    with connect(request.app.state.settings.database, write=True) as db:
        db.execute(
            "DELETE FROM sessions WHERE token_hash=?",
            (token_hash(request.cookies.get(COOKIE, "")),),
        )
    response.delete_cookie(COOKIE, path="/")


@router.post("/password", status_code=204)
def change_password(body: PasswordChange, request: Request, response: Response, user: User):
    rate_limit(request, "password:" + user.user_id, 5, 900)
    with connect(request.app.state.settings.database) as db:
        row = db.execute("SELECT password_hash FROM users WHERE id=?", (user.user_id,)).fetchone()
    if not password_matches(body.current_password, row["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    encoded = password_hash(body.new_password)
    with connect(request.app.state.settings.database, write=True) as db:
        db.execute("UPDATE users SET password_hash=? WHERE id=?", (encoded, user.user_id))
        db.execute("DELETE FROM sessions WHERE user_id=?", (user.user_id,))
    response.delete_cookie(COOKIE, path="/")


@router.post("/recover")
def recover(body: Recovery, request: Request):
    auth_limit(request, body.email)
    new_code = "iar_" + secrets.token_urlsafe(32)
    encoded = password_hash(body.password)
    with connect(request.app.state.settings.database, write=True) as db:
        row = db.execute(
            "SELECT id FROM users WHERE email=? AND recovery_hash=?",
            (body.email, token_hash(body.recovery_code)),
        ).fetchone()
        if not row:
            raise HTTPException(400, "Email or recovery code is incorrect")
        db.execute(
            "UPDATE users SET password_hash=?,recovery_hash=? WHERE id=?",
            (encoded, token_hash(new_code), row["id"]),
        )
        db.execute("DELETE FROM sessions WHERE user_id=?", (row["id"],))
        db.execute(
            "UPDATE api_keys SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
            (int(time.time()), row["id"]),
        )
    return {
        "recovery_code": new_code,
        "message": "Password reset. All sessions and ImageAPI keys were revoked. Sign in to create a new API key.",
    }


@router.delete("/account", status_code=204)
def delete_account(body: Confirmation, request: Request, response: Response, user: User):
    rate_limit(request, "password:" + user.user_id, 5, 900)
    with connect(request.app.state.settings.database) as db:
        row = db.execute("SELECT password_hash FROM users WHERE id=?", (user.user_id,)).fetchone()
    if not password_matches(body.password, row["password_hash"]):
        raise HTTPException(400, "Password is incorrect")
    with connect(request.app.state.settings.database, write=True) as db:
        db.execute("DELETE FROM users WHERE id=?", (user.user_id,))
    response.delete_cookie(COOKIE, path="/")
