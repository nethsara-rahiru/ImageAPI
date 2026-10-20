"""Real account metrics, daily chart data and paginated request history."""

import time
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Query, Request
from app.database import connect
from app.providers.catalog import PROVIDERS
from app.routes.accounts import User
from app.usage import expire_pending, month_start

router = APIRouter(tags=["Dashboard"])
PLANS = [
    {
        "id": "free",
        "name": "Free",
        "price": "$0",
        "period": "/ month",
        "limit": 100,
        "available": True,
        "description": "A little space to try big ideas.",
        "features": [
            "100 images / month",
            "All supported providers",
            "10 active API keys",
            "Playground & usage analytics",
            "Bring your own provider keys",
        ],
    },
    {
        "id": "plus",
        "name": "Plus",
        "price": "$9",
        "period": "/ month",
        "limit": 2000,
        "available": False,
        "description": "For your side projects in motion.",
        "features": [
            "2,000 images / month",
            "Everything in Free",
            "Higher request limits",
            "Extended usage history",
            "Email support",
        ],
    },
    {
        "id": "pro",
        "name": "Pro",
        "price": "$29",
        "period": "/ month",
        "limit": 10000,
        "available": False,
        "description": "More room for production ideas.",
        "features": [
            "10,000 images / month",
            "Everything in Plus",
            "Higher concurrency",
            "Usage exports",
            "Priority support",
        ],
    },
    {
        "id": "enterprise",
        "name": "Enterprise",
        "price": "Custom",
        "period": "",
        "limit": None,
        "available": False,
        "description": "Built around your organization.",
        "features": [
            "Custom volume & limits",
            "Dedicated onboarding",
            "Custom retention policies",
            "Team access (planned)",
            "Dedicated support (planned)",
        ],
    },
]


@router.get("/api/catalog")
def catalog():
    return {"providers": [{"id": key, **value} for key, value in PROVIDERS.items()]}


@router.get("/api/plans")
def plans():
    return {
        "plans": PLANS,
        "notice": "Free is available now. Paid prices and features are previews; subscriptions and payments are not enabled. Provider usage is billed separately by your provider.",
    }


@router.get("/api/usage")
def usage(
    request: Request,
    user: User,
    page: int = Query(1, ge=1, le=100000),
    status: str = Query("all", pattern="^(all|success|failed|pending|unknown)$"),
):
    expire_pending(request.app.state.settings)
    start = month_start()
    with connect(request.app.state.settings.database) as db:
        monthly = db.execute(
            "SELECT status,COUNT(*) AS count FROM usage WHERE user_id=? AND created_at>=? GROUP BY status",
            (user.user_id, start),
        ).fetchall()
        counts = {row["status"]: row["count"] for row in monthly}
        average = db.execute(
            "SELECT AVG(duration_ms) FROM usage WHERE user_id=? AND created_at>=? AND status='success'",
            (user.user_id, start),
        ).fetchone()[0]
        provider_counts = db.execute(
            "SELECT provider,COUNT(*) AS count FROM usage WHERE user_id=? AND created_at>=? AND status='success' GROUP BY provider",
            (user.user_id, start),
        ).fetchall()
        active_keys = db.execute(
            "SELECT COUNT(*) FROM api_keys WHERE user_id=? AND revoked_at IS NULL", (user.user_id,)
        ).fetchone()[0]
        connected = db.execute(
            "SELECT COUNT(*) FROM provider_keys WHERE user_id=?", (user.user_id,)
        ).fetchone()[0]
        since = int(
            (datetime.now(timezone.utc) - timedelta(days=29))
            .replace(hour=0, minute=0, second=0, microsecond=0)
            .timestamp()
        )
        daily_rows = db.execute(
            "SELECT date(created_at,'unixepoch') AS day,COUNT(*) AS count FROM usage WHERE user_id=? AND created_at>=? AND status='success' GROUP BY day",
            (user.user_id, since),
        ).fetchall()
        where, params = "u.user_id=?", [user.user_id]
        if status != "all":
            where += " AND u.status=?"
            params.append(status)
        total = db.execute("SELECT COUNT(*) FROM usage u WHERE " + where, params).fetchone()[0]
        rows = db.execute(
            "SELECT u.*,k.name AS key_name FROM usage u LEFT JOIN api_keys k ON u.api_key_id=k.id WHERE "
            + where
            + " ORDER BY u.created_at DESC,u.id DESC LIMIT 10 OFFSET ?",
            [*params, (page - 1) * 10],
        ).fetchall()
    daily_map = {row["day"]: row["count"] for row in daily_rows}
    daily = [
        {
            "day": datetime.fromtimestamp(since + i * 86400, timezone.utc).strftime("%Y-%m-%d"),
            "count": daily_map.get(
                datetime.fromtimestamp(since + i * 86400, timezone.utc).strftime("%Y-%m-%d"), 0
            ),
        }
        for i in range(30)
    ]
    successful = counts.get("success", 0)
    used = successful + counts.get("pending", 0) + counts.get("unknown", 0)
    attempts = sum(counts.values())
    now = datetime.now(timezone.utc)
    reset = (now.replace(day=28) + timedelta(days=4)).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    return {
        "summary": {
            "images": successful,
            "used": used,
            "limit": request.app.state.settings.free_limit,
            "requests": attempts,
            "failed": counts.get("failed", 0),
            "success_rate": round(successful / attempts * 100, 1) if attempts else None,
            "average_ms": round(average) if average else None,
            "active_keys": active_keys,
            "connected_providers": connected,
            "reset_at": int(reset.timestamp()),
        },
        "daily": daily,
        "providers": [dict(row) for row in provider_counts],
        "requests": [dict(row) for row in rows],
        "pagination": {"page": page, "total": total, "pages": max(1, (total + 9) // 10)},
    }
