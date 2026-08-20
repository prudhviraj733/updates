"""Reliable client-platform detection (Website vs Android app) + usage pings."""
from datetime import datetime, timezone

from fastapi import Request

from core.db import db

APP_VALUES = {"app", "android", "ios", "mobile", "twa", "webview"}


def client_platform(request: Request) -> str:
    """Return 'app' for the Android WebView/TWA app, else 'web'.

    Priority: explicit X-Client-Platform header (set by the frontend) ->
    X-Requested-With (Android WebView sends its package name) -> UA hints.
    """
    p = (request.headers.get("x-client-platform") or "").strip().lower()
    if p in APP_VALUES:
        return "app"
    if p == "web":
        return "web"
    xrw = (request.headers.get("x-requested-with") or "").strip().lower()
    if xrw and xrw != "xmlhttprequest":
        return "app"
    ua = (request.headers.get("user-agent") or "").lower()
    if "freshlyapp" in ua or "median" in ua or "; wv)" in ua:
        return "app"
    return "web"


def client_visitor_id(request: Request) -> str:
    return (request.headers.get("x-visitor-id") or "").strip()


async def record_ping(request: Request, uid: str = None) -> str:
    """Record a de-duplicated (visitor, platform, day) usage ping."""
    platform = client_platform(request)
    vid = client_visitor_id(request) or (f"user:{uid}" if uid else None)
    if not vid:
        return platform
    now = datetime.now(timezone.utc).isoformat()
    day = now[:10]
    await db.usage_pings.update_one(
        {"visitor_id": vid, "platform": platform, "day": day},
        {"$setOnInsert": {"first_ping_at": now}, "$set": {"user_id": uid, "last_ping_at": now}},
        upsert=True,
    )
    await db.visitors.update_one(
        {"visitor_id": vid, "platform": platform},
        {"$setOnInsert": {"first_seen": now}, "$set": {"user_id": uid, "last_seen": now}},
        upsert=True,
    )
    return platform
