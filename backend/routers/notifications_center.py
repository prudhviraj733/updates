"""Unified notification system (web + future Android app).

- Customer device-token registration/update/removal (multi-device).
- Per-recipient in-app notifications (notification center).
- Admin compose/send (all / selected / segments), send-now or scheduled.
- Automatic notifications (orders, payments, refunds) via create_user_notification.
- FCM push (Android background/closed) with deep links, shared by both clients.

Nothing here is web-specific: the same records/endpoints/payload power the
future Android app.
"""
import hmac
import logging
import os
from datetime import datetime, timezone, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks

from core.db import db
from core.security import get_current_user, require_admin
from core import fcm
from models import DeviceTokenInput, NotificationComposeInput, gen_id, now_iso

logger = logging.getLogger(__name__)
router = APIRouter()

SEGMENTS = [
    {"key": "all", "label": "All customers"},
    {"key": "new", "label": "New (no orders yet)"},
    {"key": "active", "label": "Active (ordered in last 30 days)"},
    {"key": "inactive", "label": "Inactive (no order in 45+ days)"},
    {"key": "high_value", "label": "High value (spent \u20b95000+)"},
    {"key": "with_wallet", "label": "Has wallet balance"},
]


# ==================== Device tokens ====================
@router.put("/me/device-tokens")
async def register_device_token(payload: DeviceTokenInput, user: dict = Depends(get_current_user)):
    now = now_iso()
    await db.device_tokens.update_one(
        {"user_id": user["id"], "token": payload.token},
        {"$set": {"platform": payload.platform, "device_id": payload.device_id,
                  "last_seen_at": now},
         "$setOnInsert": {"id": gen_id(), "user_id": user["id"],
                          "token": payload.token, "created_at": now}},
        upsert=True,
    )
    return {"ok": True}


@router.delete("/me/device-tokens/{token}")
async def remove_device_token(token: str, user: dict = Depends(get_current_user)):
    await db.device_tokens.delete_one({"user_id": user["id"], "token": token})
    return {"ok": True}


# ==================== Customer notification center ====================
@router.get("/me/notifications")
async def my_notifications(limit: int = 50, user: dict = Depends(get_current_user)):
    rows = await db.notifications.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(min(limit, 200))
    return rows


@router.get("/me/notifications/unread-count")
async def my_unread_count(user: dict = Depends(get_current_user)):
    count = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"count": count}


@router.post("/me/notifications/{notif_id}/read")
async def mark_read(notif_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one(
        {"id": notif_id, "user_id": user["id"]},
        {"$set": {"read": True, "read_at": now_iso()}})
    return {"ok": True}


@router.post("/me/notifications/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": user["id"], "read": False},
        {"$set": {"read": True, "read_at": now_iso()}})
    return {"ok": True}


# ==================== Core helpers (shared by auto + admin) ====================
async def create_user_notification(user_id, title, body, *, image=None, deep_link=None,
                                    ntype="general", data=None, campaign_id=None,
                                    push=True):
    """Create one in-app notification and (optionally) push it to the user's devices."""
    doc = {
        "id": gen_id(), "user_id": str(user_id), "campaign_id": campaign_id,
        "title": title, "body": body, "image": image or None,
        "deep_link": deep_link or None, "type": ntype,
        "data": data or {}, "read": False, "read_at": None, "created_at": now_iso(),
    }
    await db.notifications.insert_one(doc)
    if push:
        try:
            docs = await db.device_tokens.find({"user_id": str(user_id)}, {"token": 1}).to_list(500)
            tokens = [d["token"] for d in docs]
            if tokens:
                pdata = {"type": ntype, "deep_link": deep_link or "", "notification_id": doc["id"]}
                pdata.update({k: str(v) for k, v in (data or {}).items()})
                res = await fcm.send_to_tokens(tokens, title, body, data=pdata, image=image)
                if res.get("removed_tokens"):
                    await db.device_tokens.delete_many({"token": {"$in": res["removed_tokens"]}})
        except Exception as e:
            logger.error(f"push error: {e}")
    doc.pop("_id", None)
    return doc


async def resolve_target_user_ids(target_type, customer_ids=None, segment=None):
    """Return a list of customer user_id strings for the chosen targeting."""
    if target_type == "selected":
        ids = [str(x) for x in (customer_ids or [])]
        valid = await db.users.find({"_id": {"$in": [ObjectId(i) for i in ids if ObjectId.is_valid(i)]},
                                     "role": "customer"}, {"_id": 1}).to_list(5000)
        return [str(u["_id"]) for u in valid]

    if target_type == "segment":
        return await _segment_user_ids(segment)

    # all
    rows = await db.users.find({"role": "customer"}, {"_id": 1}).to_list(100000)
    return [str(u["_id"]) for u in rows]


async def _segment_user_ids(segment):
    now = datetime.now(timezone.utc)
    all_customers = {str(u["_id"]) for u in
                     await db.users.find({"role": "customer"}, {"_id": 1}).to_list(100000)}
    if segment == "new":
        ordered = set(await db.orders.distinct("user_id"))
        return [u for u in all_customers if u not in ordered]
    if segment == "active":
        cutoff = (now - timedelta(days=30)).isoformat()
        return list({o for o in await db.orders.distinct("user_id", {"created_at": {"$gte": cutoff}})})
    if segment == "inactive":
        recent = set(await db.orders.distinct("user_id",
                     {"created_at": {"$gte": (now - timedelta(days=45)).isoformat()}}))
        ever = set(await db.orders.distinct("user_id"))
        return list(ever - recent)
    if segment == "high_value":
        agg = await db.orders.aggregate([
            {"$match": {"status": "delivered"}},
            {"$group": {"_id": "$user_id", "spent": {"$sum": "$final_amount"}}},
            {"$match": {"spent": {"$gte": 5000}}},
        ]).to_list(100000)
        return [r["_id"] for r in agg]
    if segment == "with_wallet":
        agg = await db.wallet_ledger.aggregate([
            {"$group": {"_id": "$user_id", "bal": {"$sum": "$amount"}}},
            {"$match": {"bal": {"$gt": 0}}},
        ]).to_list(100000)
        return [r["_id"] for r in agg]
    return list(all_customers)


async def dispatch_campaign(campaign_id):
    """Send a composed campaign to all its recipients (in-app + push)."""
    c = await db.notification_campaigns.find_one({"id": campaign_id})
    if not c or c.get("status") == "sent":
        return
    user_ids = await resolve_target_user_ids(c["target_type"], c.get("customer_ids"), c.get("segment"))
    now = now_iso()
    if user_ids:
        await db.notifications.insert_many([{
            "id": gen_id(), "user_id": uid, "campaign_id": campaign_id,
            "title": c["title"], "body": c["body"], "image": c.get("image"),
            "deep_link": c.get("deep_link"), "type": c.get("type", "announcement"),
            "data": {}, "read": False, "read_at": None, "created_at": now,
        } for uid in user_ids])

    # Push to every device of every recipient (chunked internally by fcm).
    success = 0
    if fcm.configured() and user_ids:
        toks = await db.device_tokens.find({"user_id": {"$in": user_ids}}, {"token": 1}).to_list(100000)
        tokens = [t["token"] for t in toks]
        if tokens:
            res = await fcm.send_to_tokens(
                tokens, c["title"], c["body"],
                data={"type": c.get("type", "announcement"), "deep_link": c.get("deep_link") or "",
                      "campaign_id": campaign_id},
                image=c.get("image"))
            success = res.get("success_count", 0)
            if res.get("removed_tokens"):
                await db.device_tokens.delete_many({"token": {"$in": res["removed_tokens"]}})
    await db.notification_campaigns.update_one(
        {"id": campaign_id},
        {"$set": {"status": "sent", "sent_at": now, "recipient_count": len(user_ids),
                  "push_success_count": success, "updated_at": now}})


# ==================== Admin ====================
@router.get("/admin/notifications/segments")
async def admin_segments(admin: dict = Depends(require_admin)):
    out = []
    for s in SEGMENTS:
        ids = await resolve_target_user_ids("all") if s["key"] == "all" else await _segment_user_ids(s["key"])
        out.append({**s, "count": len(ids)})
    return out


@router.get("/admin/notifications")
async def admin_list_campaigns(admin: dict = Depends(require_admin)):
    rows = await db.notification_campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for r in rows:
        r["read_count"] = await db.notifications.count_documents(
            {"campaign_id": r["id"], "read": True})
    return rows


@router.get("/admin/notifications/{campaign_id}")
async def admin_campaign_detail(campaign_id: str, admin: dict = Depends(require_admin)):
    c = await db.notification_campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Notification not found")
    c["read_count"] = await db.notifications.count_documents({"campaign_id": campaign_id, "read": True})
    c["delivered_count"] = await db.notifications.count_documents({"campaign_id": campaign_id})
    return c


@router.post("/admin/notifications")
async def admin_create_campaign(payload: NotificationComposeInput, background: BackgroundTasks,
                                admin: dict = Depends(require_admin)):
    if payload.target_type == "selected" and not payload.customer_ids:
        raise HTTPException(status_code=400, detail="Select at least one customer")
    if payload.target_type == "segment" and not payload.segment:
        raise HTTPException(status_code=400, detail="Choose a segment")

    scheduled_at = None
    status = "sending"
    if payload.scheduled_at:
        try:
            dt = datetime.fromisoformat(payload.scheduled_at.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid schedule time")
        if dt > datetime.now(timezone.utc) + timedelta(minutes=1):
            scheduled_at = dt.isoformat()
            status = "scheduled"

    # estimate recipients now for the history view
    est = await resolve_target_user_ids(payload.target_type, payload.customer_ids, payload.segment)
    now = now_iso()
    doc = {
        "id": gen_id(), "title": payload.title.strip(), "body": payload.body.strip(),
        "image": (payload.image or "").strip() or None,
        "deep_link": (payload.deep_link or "").strip() or None,
        "type": payload.type or "announcement",
        "target_type": payload.target_type, "customer_ids": payload.customer_ids or [],
        "segment": payload.segment, "scheduled_at": scheduled_at,
        "status": status, "recipient_count": len(est), "push_success_count": 0,
        "created_by": admin.get("email"), "created_at": now, "updated_at": now, "sent_at": None,
    }
    await db.notification_campaigns.insert_one(doc)
    doc.pop("_id", None)
    if status == "sending":
        background.add_task(dispatch_campaign, doc["id"])
    return doc


@router.delete("/admin/notifications/{campaign_id}")
async def admin_cancel_campaign(campaign_id: str, admin: dict = Depends(require_admin)):
    c = await db.notification_campaigns.find_one({"id": campaign_id})
    if not c:
        raise HTTPException(status_code=404, detail="Notification not found")
    if c.get("status") != "scheduled":
        raise HTTPException(status_code=400, detail="Only scheduled notifications can be cancelled")
    await db.notification_campaigns.update_one({"id": campaign_id},
                                               {"$set": {"status": "cancelled", "updated_at": now_iso()}})
    return {"ok": True}


# ==================== Cron: dispatch due scheduled campaigns ====================
@router.post("/cron/dispatch-notifications")
async def cron_dispatch(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    now = datetime.now(timezone.utc).isoformat()
    due = await db.notification_campaigns.find(
        {"status": "scheduled", "scheduled_at": {"$lte": now}}, {"id": 1, "_id": 0}).to_list(100)
    for c in due:
        await db.notification_campaigns.update_one({"id": c["id"]}, {"$set": {"status": "sending"}})
        background.add_task(dispatch_campaign, c["id"])
    return {"ok": True, "queued": len(due)}
