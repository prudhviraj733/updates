"""Platform usage tracking + Website-vs-App analytics (real data only)."""
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, Request, Depends

from core.db import db
from core.security import require_admin, get_jwt_secret, JWT_ALGORITHM
from core.platform import record_ping

router = APIRouter()


def _optional_uid(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return None
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except Exception:
        return None


@router.post("/usage/track")
async def track_usage(request: Request):
    """Public: record one usage ping (deduped per visitor+platform+day)."""
    platform = await record_ping(request, _optional_uid(request))
    return {"ok": True, "platform": platform}


def _range(days, start, end):
    now = datetime.now(timezone.utc)
    if start and end:
        return f"{start}T00:00:00", f"{end}T23:59:59.999999", f"{start} to {end}"
    if days is not None and days >= 30:
        return (now - timedelta(days=30)).isoformat(), now.isoformat(), "Last 30 Days"
    if days is not None and days >= 7:
        return (now - timedelta(days=7)).isoformat(), now.isoformat(), "Last 7 Days"
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(), now.isoformat(), "Today"


@router.get("/admin/analytics/platform")
async def platform_analytics(days: int = None, start: str = None, end: str = None,
                             admin: dict = Depends(require_admin)):
    scut, ecut, label = _range(days, start, end)

    registered_total = await db.users.count_documents({"role": "customer"})

    # ---- Usage pings (unique visitors + active/registered users) ----
    pings = await db.usage_pings.find(
        {"day": {"$gte": scut[:10], "$lte": ecut[:10]}}, {"_id": 0}).to_list(100000)
    visitors_docs = await db.visitors.find({}, {"_id": 0}).to_list(100000)
    first_seen = {(v["platform"], v["visitor_id"]): v.get("first_seen", "") for v in visitors_docs}

    def usage_bucket(platform):
        p = [x for x in pings if x.get("platform") == platform]
        uv = {x["visitor_id"] for x in p}
        users = {x["user_id"] for x in p if x.get("user_id")}
        new_v = sum(1 for vid in uv if first_seen.get((platform, vid), "") >= scut)
        return {"unique_visitors": len(uv), "registered_users": len(users),
                "new_visitors": new_v, "returning_visitors": len(uv) - new_v}

    web_u, app_u = usage_bucket("web"), usage_bucket("app")
    active_users = len({x["user_id"] for x in pings if x.get("user_id")})

    # ---- Orders + revenue by platform (real order data) ----
    orders = await db.orders.find(
        {"created_at": {"$gte": scut, "$lt": ecut}}, {"_id": 0}).to_list(100000)

    def order_bucket(platform):
        rows = [o for o in orders if (o.get("platform") or "web") == platform and o.get("status") != "cancelled"]
        return {"orders": len(rows), "revenue": round(sum(o.get("final_amount", 0) for o in rows), 2)}

    web_o, app_o = order_bucket("web"), order_bucket("app")

    # ---- New registered customers by signup platform ----
    new_web = await db.users.count_documents({
        "role": "customer", "created_at": {"$gte": scut, "$lt": ecut},
        "$or": [{"signup_platform": "web"}, {"signup_platform": {"$exists": False}}]})
    new_app = await db.users.count_documents({
        "role": "customer", "created_at": {"$gte": scut, "$lt": ecut}, "signup_platform": "app"})

    return {
        "period": label,
        "registered_total": registered_total,
        "active_users": active_users,
        "unique_visitors": web_u["unique_visitors"] + app_u["unique_visitors"],
        "website": {
            "users": web_u["registered_users"], "unique_visitors": web_u["unique_visitors"],
            "returning_visitors": web_u["returning_visitors"], "new_users": new_web,
            "orders": web_o["orders"], "revenue": web_o["revenue"],
        },
        "app": {
            "users": app_u["registered_users"], "unique_visitors": app_u["unique_visitors"],
            "returning_visitors": app_u["returning_visitors"], "new_users": new_app,
            "orders": app_o["orders"], "revenue": app_o["revenue"],
        },
    }
