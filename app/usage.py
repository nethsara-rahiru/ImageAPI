"""Atomic quota reservations and metadata-only request history."""

import secrets
import time
from datetime import datetime, timezone

from fastapi import HTTPException
from app.database import connect


def month_start():
    return int(
        datetime.now(timezone.utc)
        .replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        .timestamp()
    )


def reserve(settings, user, body):
    now = int(time.time())
    request_id = "req_" + secrets.token_hex(12)
    expire_pending(settings)
    with connect(settings.database, write=True) as db:
        active = db.execute(
            "SELECT COUNT(*) FROM usage WHERE user_id=? AND status='pending'", (user.user_id,)
        ).fetchone()[0]
        if active >= settings.concurrent_generations:
            raise HTTPException(
                429,
                "Two generations are already running. Wait for one to finish",
                headers={"Retry-After": "10"},
            )
        count = db.execute(
            "SELECT COUNT(*) FROM usage WHERE user_id=? AND created_at>=? AND status IN ('success','pending','unknown')",
            (user.user_id, month_start()),
        ).fetchone()[0]
        if count >= settings.free_limit:
            raise HTTPException(
                429, "Monthly image limit reached. It resets on the first day of next month (UTC)"
            )
        db.execute(
            "INSERT INTO usage(id,user_id,api_key_id,provider,model,size,source,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (
                request_id,
                user.user_id,
                user.key_id,
                body.provider,
                body.model,
                body.size,
                "api" if user.key_id else "playground",
                "pending",
                now,
            ),
        )
    return request_id


def finish(settings, request_id, status, duration, error=None):
    with connect(settings.database, write=True) as db:
        db.execute(
            "UPDATE usage SET status=?,duration_ms=?,error_code=? WHERE id=?",
            (status, duration, error, request_id),
        )


def expire_pending(settings):
    # The provider may have completed an interrupted request; preserve its quota.
    with connect(settings.database, write=True) as db:
        db.execute(
            "UPDATE usage SET status='unknown',error_code='interrupted' WHERE status='pending' AND created_at<?",
            (int(time.time()) - 300,),
        )
