"""User-owned platform keys and encrypted upstream provider credentials."""

import time

from cryptography.fernet import InvalidToken
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from app.auth import issue_api_key
from app.database import connect
from app.providers.catalog import PROVIDERS
from app.routes.accounts import User

router = APIRouter(prefix="/api", tags=["Keys"])


class KeyName(BaseModel):
    name: str = Field(min_length=1, max_length=60)

    @field_validator("name")
    @classmethod
    def clean(cls, value):
        if not value.strip():
            raise ValueError("Key name cannot be blank")
        return value.strip()


class ProviderKey(BaseModel):
    api_key: str = Field(min_length=8, max_length=512)

    @field_validator("api_key")
    @classmethod
    def clean(cls, value):
        if any(char.isspace() for char in value) or not value.isascii():
            raise ValueError("API key must be ASCII without whitespace")
        return value


@router.get("/keys")
def list_keys(request: Request, user: User):
    with connect(request.app.state.settings.database) as db:
        rows = db.execute(
            "SELECT id,name,prefix,created_at,last_used_at,revoked_at FROM api_keys WHERE user_id=? ORDER BY created_at DESC",
            (user.user_id,),
        ).fetchall()
    return {"keys": [dict(row) for row in rows], "limit": request.app.state.settings.max_api_keys}


@router.post("/keys", status_code=201)
def create_key(body: KeyName, request: Request, user: User):
    with connect(request.app.state.settings.database, write=True) as db:
        count = db.execute(
            "SELECT COUNT(*) FROM api_keys WHERE user_id=? AND revoked_at IS NULL", (user.user_id,)
        ).fetchone()[0]
        if count >= request.app.state.settings.max_api_keys:
            raise HTTPException(409, "Maximum active keys reached. Revoke a key first")
        key_id, token = issue_api_key(db, user.user_id, body.name)
    return {"id": key_id, "api_key": token, "name": body.name}


@router.delete("/keys/{key_id}", status_code=204)
def revoke_key(key_id: str, request: Request, user: User):
    with connect(request.app.state.settings.database, write=True) as db:
        cursor = db.execute(
            "UPDATE api_keys SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL",
            (int(time.time()), key_id, user.user_id),
        )
        if not cursor.rowcount:
            raise HTTPException(404, "Active key not found")


@router.get("/providers")
def list_providers(request: Request, user: User):
    with connect(request.app.state.settings.database) as db:
        rows = {
            row["provider"]: row
            for row in db.execute(
                "SELECT provider,hint,updated_at FROM provider_keys WHERE user_id=?",
                (user.user_id,),
            )
        }
    return {
        "providers": [
            {
                **provider,
                "id": key,
                "connected": key in rows,
                "hint": rows[key]["hint"] if key in rows else None,
                "updated_at": rows[key]["updated_at"] if key in rows else None,
            }
            for key, provider in PROVIDERS.items()
        ]
    }


@router.put("/providers/{provider}")
def save_provider(provider: str, body: ProviderKey, request: Request, user: User):
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unknown provider")
    encrypted = request.app.state.cipher.encrypt(body.api_key.encode()).decode()
    hint = "••••" + body.api_key[-4:]
    with connect(request.app.state.settings.database, write=True) as db:
        db.execute(
            "INSERT INTO provider_keys VALUES (?,?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET encrypted_key=excluded.encrypted_key,hint=excluded.hint,updated_at=excluded.updated_at",
            (user.user_id, provider, encrypted, hint, int(time.time())),
        )
    return {
        "connected": True,
        "hint": hint,
        "message": "Key saved. It will be verified on your first generation request.",
    }


@router.delete("/providers/{provider}", status_code=204)
def delete_provider(provider: str, request: Request, user: User):
    with connect(request.app.state.settings.database, write=True) as db:
        db.execute(
            "DELETE FROM provider_keys WHERE user_id=? AND provider=?", (user.user_id, provider)
        )


def read_provider_key(request, user_id, provider):
    with connect(request.app.state.settings.database) as db:
        row = db.execute(
            "SELECT encrypted_key FROM provider_keys WHERE user_id=? AND provider=?",
            (user_id, provider),
        ).fetchone()
    if not row:
        raise HTTPException(409, "Add your provider API key in Settings before generating an image")
    try:
        return request.app.state.cipher.decrypt(row["encrypted_key"].encode()).decode()
    except InvalidToken:
        raise HTTPException(503, "Provider key could not be decrypted. Reconnect it in Settings")
