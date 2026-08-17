import random
import string
from datetime import datetime, timezone, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request

from core.db import db
from core.security import get_current_user, require_admin
from models import CampaignInput, PersonalizationSettingsInput, gen_id, now_iso

router = APIRouter()

DEFAULT_SETTINGS = {
    "active_days": 30, "inactive_days": 45, "comeback_days": 30,
    "high_value_spend": 5000, "repeat_orders": 3, "frequent_orders": 5,
    "category_affinity_count": 2,
}

SEGMENTS = ["new", "active", "repeat", "high_value", "inactive", "at_risk",
            "monthly_combo", "dry_fruit", "frequent_grocery"]


async def get_settings() -> dict:
    s = await db.personalization_settings.find_one({"key": "global"}, {"_id": 0})
    return {**DEFAULT_SETTINGS, **(s or {})}


async def compute_metrics(user_id: str) -> dict:
    orders = await db.orders.find(
        {"user_id": user_id, "status": {"$ne": "cancelled"}}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    order_count = len(orders)
    total_spend = sum(o.get("final_amount", 0) for o in orders)
    aov = round(total_spend / order_count, 2) if order_count else 0
    last_order = orders[0]["created_at"] if orders else None
    days_since = None
    if last_order:
        try:
            dt = datetime.fromisoformat(last_order)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            days_since = (datetime.now(timezone.utc) - dt).days
        except Exception:
            days_since = None
    product_counts, category_counts, locations = {}, {}, set()
    combo_orders = 0
    for o in orders:
        locations.add(o.get("location_id"))
        if o.get("items") and any("combo" in (o.get("notes", "") or "").lower() for _ in [0]):
            pass
    # category affinity via product lookup
    for o in orders:
        for it in o.get("items", []):
            pid = it["product_id"]
            product_counts[pid] = product_counts.get(pid, 0) + it.get("quantity", 1)
    # map products to categories
    pids = list(product_counts.keys())
    if pids:
        async for p in db.products.find({"id": {"$in": pids}}, {"_id": 0, "id": 1, "category_id": 1}):
            category_counts[p["category_id"]] = category_counts.get(p["category_id"], 0) + product_counts.get(p["id"], 0)
    # combo purchases: orders whose coupon/campaign referenced a package OR items match a package
    combo_orders = await db.orders.count_documents({"user_id": user_id, "is_combo_order": True})
    return {
        "user_id": user_id, "order_count": order_count, "total_spend": round(total_spend, 2),
        "aov": aov, "last_order": last_order, "days_since": days_since,
        "product_counts": product_counts, "category_counts": category_counts,
        "locations": [l for l in locations if l], "combo_orders": combo_orders,
    }


async def classify(metrics: dict, settings: dict) -> list:
    segs = []
    oc = metrics["order_count"]
    ds = metrics["days_since"]
    if oc == 0:
        segs.append("new")
        return segs
    if ds is not None and ds <= settings["active_days"]:
        segs.append("active")
    if oc >= settings["repeat_orders"]:
        segs.append("repeat")
    if metrics["total_spend"] >= settings["high_value_spend"]:
        segs.append("high_value")
    if ds is not None and ds >= settings["inactive_days"]:
        segs.append("inactive")
    elif ds is not None and settings["active_days"] < ds < settings["inactive_days"]:
        segs.append("at_risk")
    if metrics["combo_orders"] >= 1:
        segs.append("monthly_combo")
    if oc >= settings["frequent_orders"]:
        segs.append("frequent_grocery")
    # dry fruit affinity
    df_cats = await db.categories.find({"name": {"$in": ["Dry Fruits", "Nuts"]}}, {"_id": 0, "id": 1}).to_list(10)
    df_ids = {c["id"] for c in df_cats}
    if sum(v for k, v in metrics["category_counts"].items() if k in df_ids) >= settings["category_affinity_count"]:
        segs.append("dry_fruit")
    return segs


async def _all_customer_metrics():
    users = await db.users.find({"role": "customer"}, {"password_hash": 0}).to_list(5000)
    settings = await get_settings()
    out = []
    for u in users:
        uid = str(u["_id"])
        m = await compute_metrics(uid)
        m["segments"] = await classify(m, settings)
        m["name"] = u.get("name"); m["email"] = u.get("email"); m["phone"] = u.get("phone")
        out.append(m)
    return out


def _matches_conditions(m: dict, c: dict) -> bool:
    if not c:
        return True
    if c.get("not_ordered_days") and (m["days_since"] is None or m["days_since"] < c["not_ordered_days"]):
        return False
    if c.get("min_aov") and m["aov"] < c["min_aov"]:
        return False
    if c.get("min_total_spend") and m["total_spend"] < c["min_total_spend"]:
        return False
    if c.get("min_orders") and m["order_count"] < c["min_orders"]:
        return False
    if c.get("purchased_product_id") and c["purchased_product_id"] not in m["product_counts"]:
        return False
    if c.get("purchased_category_id") and c["purchased_category_id"] not in m["category_counts"]:
        return False
    if c.get("purchased_combo") and m["combo_orders"] < 1:
        return False
    return True


async def eligible_customers(campaign: dict):
    metrics = await _all_customer_metrics()
    tt = campaign.get("target_type", "all")
    locs = campaign.get("location_ids", [])
    result = []
    for m in metrics:
        if tt in ("individual", "multiple") and m["user_id"] not in campaign.get("customer_ids", []):
            continue
        if tt == "segment" and campaign.get("segment") not in m["segments"]:
            continue
        if locs and not (set(locs) & set(m["locations"])) and m["order_count"] > 0:
            continue
        if not _matches_conditions(m, campaign.get("conditions", {})):
            continue
        result.append(m)
    return result


# ---------------- Admin: settings ----------------
@router.get("/admin/personalization/settings")
async def admin_get_settings(admin: dict = Depends(require_admin)):
    return await get_settings()


@router.put("/admin/personalization/settings")
async def admin_update_settings(payload: PersonalizationSettingsInput, admin: dict = Depends(require_admin)):
    data = payload.model_dump()
    data["key"] = "global"
    await db.personalization_settings.update_one({"key": "global"}, {"$set": data}, upsert=True)
    return await get_settings()


@router.get("/admin/segments")
async def admin_segments(admin: dict = Depends(require_admin)):
    metrics = await _all_customer_metrics()
    counts = {s: 0 for s in SEGMENTS}
    for m in metrics:
        for s in m["segments"]:
            counts[s] = counts.get(s, 0) + 1
    return {"segments": SEGMENTS, "counts": counts, "total_customers": len(metrics)}


# ---------------- Admin: campaigns ----------------
@router.get("/admin/campaigns")
async def list_campaigns(admin: dict = Depends(require_admin)):
    return await db.campaigns.find({}, {"_id": 0}).sort("priority", -1).to_list(500)


@router.post("/admin/campaigns")
async def create_campaign(payload: CampaignInput, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc.update({"id": gen_id(), "created_at": now_iso(), "updated_at": now_iso()})
    await db.campaigns.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/admin/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, payload: CampaignInput, admin: dict = Depends(require_admin)):
    data = payload.model_dump()
    data["updated_at"] = now_iso()
    res = await db.campaigns.update_one({"id": campaign_id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})


@router.delete("/admin/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, admin: dict = Depends(require_admin)):
    await db.campaigns.update_one({"id": campaign_id}, {"$set": {"is_active": False}})
    return {"message": "Campaign deactivated"}


@router.get("/admin/campaigns/{campaign_id}/eligible")
async def campaign_eligible(campaign_id: str, admin: dict = Depends(require_admin)):
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    elig = await eligible_customers(campaign)
    return [{"user_id": m["user_id"], "name": m["name"], "email": m["email"],
             "order_count": m["order_count"], "total_spend": m["total_spend"], "segments": m["segments"]}
            for m in elig]


def _gen_code(name: str) -> str:
    base = "".join([ch for ch in name.upper() if ch.isalnum()])[:6] or "OFFER"
    return base + "".join(random.choices(string.ascii_uppercase + string.digits, k=4))


@router.post("/admin/campaigns/{campaign_id}/issue")
async def issue_coupons(campaign_id: str, admin: dict = Depends(require_admin)):
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    elig = await eligible_customers(campaign)
    expiry = None
    if campaign.get("end_date"):
        expiry = campaign["end_date"]
    else:
        expiry = (datetime.now(timezone.utc) + timedelta(days=7)).date().isoformat()
    issued = 0
    for m in elig:
        exists = await db.personalized_coupons.find_one({"campaign_id": campaign_id, "user_id": m["user_id"]})
        if exists:
            continue
        code = _gen_code(campaign["name"])
        while await db.personalized_coupons.find_one({"code": code}) or await db.coupons.find_one({"code": code}):
            code = _gen_code(campaign["name"])
        await db.personalized_coupons.insert_one({
            "id": gen_id(), "code": code, "user_id": m["user_id"], "campaign_id": campaign_id,
            "campaign_name": campaign["name"], "offer_type": campaign["offer_type"],
            "discount_type": campaign["discount_type"], "discount_value": campaign["discount_value"],
            "max_discount": campaign.get("max_discount"), "min_order_value": campaign.get("min_order_value", 0),
            "free_delivery": campaign.get("free_delivery", False), "location_ids": campaign.get("location_ids", []),
            "product_id": campaign.get("product_id"), "category_id": campaign.get("category_id"),
            "expiry": expiry, "usage_limit": campaign.get("usage_limit_per_customer", 1),
            "used_count": 0, "shareable": campaign.get("shareable", False),
            "is_active": True, "created_at": now_iso(),
        })
        issued += 1
    return {"issued": issued, "eligible": len(elig)}


@router.get("/admin/campaigns/{campaign_id}/analytics")
async def campaign_analytics(campaign_id: str, admin: dict = Depends(require_admin)):
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    coupons = await db.personalized_coupons.find({"campaign_id": campaign_id}, {"_id": 0}).to_list(10000)
    issued = len(coupons)
    redeemed = sum(1 for c in coupons if c.get("used_count", 0) > 0)
    orders = await db.orders.find({"campaign_id": campaign_id, "status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(10000)
    revenue = sum(o.get("final_amount", 0) for o in orders)
    discount = sum(o.get("coupon_discount", 0) for o in orders)
    free_del = sum(1 for o in orders if o.get("free_delivery_applied"))
    eligible = len(await eligible_customers(campaign))
    return {
        "customers_targeted": issued or eligible, "customers_eligible": eligible,
        "coupons_issued": issued, "coupons_redeemed": redeemed,
        "orders_generated": len(orders), "revenue_generated": round(revenue, 2),
        "total_discount_given": round(discount, 2),
        "average_order_value": round(revenue / len(orders), 2) if orders else 0,
        "conversion_rate": round(redeemed / issued * 100, 1) if issued else 0,
        "free_delivery_usage": free_del,
        "start_date": campaign.get("start_date"), "end_date": campaign.get("end_date"),
    }


# ---------------- Admin: Customer 360 offers ----------------
@router.get("/admin/customers/{user_id}/offers")
async def customer_offers(user_id: str, admin: dict = Depends(require_admin)):
    coupons = await db.personalized_coupons.find({"user_id": user_id}, {"_id": 0}).to_list(500)
    today = datetime.now(timezone.utc).date().isoformat()
    current = [c for c in coupons if c.get("is_active") and c.get("used_count", 0) < c.get("usage_limit", 1) and (not c.get("expiry") or c["expiry"] >= today)]
    redeemed = [c for c in coupons if c.get("used_count", 0) > 0]
    expired = [c for c in coupons if c.get("expiry") and c["expiry"] < today and c.get("used_count", 0) == 0]
    try:
        m = await compute_metrics(user_id)
        settings = await get_settings()
        m["segments"] = await classify(m, settings)
    except Exception:
        m = {}
    return {"current": current, "redeemed": redeemed, "expired": expired,
            "coupons_received": len(coupons), "metrics": {k: m.get(k) for k in ["order_count", "total_spend", "aov", "days_since", "segments"]}}


# ---------------- Customer-facing ----------------
async def resolve_personalized(code: str, user_id: str, location_id: str, subtotal: float):
    c = await db.personalized_coupons.find_one({"code": code.upper()}, {"_id": 0})
    if not c:
        return None
    if not c.get("shareable") and c["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="This coupon is not valid for your account")
    if not c.get("is_active"):
        raise HTTPException(status_code=400, detail="Coupon is inactive")
    today = datetime.now(timezone.utc).date().isoformat()
    if c.get("expiry") and c["expiry"] < today:
        raise HTTPException(status_code=400, detail="Coupon has expired")
    if c.get("used_count", 0) >= c.get("usage_limit", 1):
        raise HTTPException(status_code=400, detail="Coupon usage limit reached")
    if c.get("location_ids") and location_id not in c["location_ids"]:
        raise HTTPException(status_code=400, detail="Coupon not valid for this location")
    if subtotal < c.get("min_order_value", 0):
        raise HTTPException(status_code=400, detail=f"Minimum order value ₹{c['min_order_value']} required")
    if c["discount_type"] == "percentage":
        disc = subtotal * c["discount_value"] / 100
        if c.get("max_discount"):
            disc = min(disc, c["max_discount"])
    else:
        disc = c["discount_value"]
    disc = round(min(disc, subtotal), 2)
    return {"code": c["code"], "discount": disc, "free_delivery": c.get("free_delivery", False),
            "campaign_id": c.get("campaign_id"), "personalized": True, "message": "Personalized offer applied"}


@router.get("/me/offers")
async def my_offers(location_id: str = None, user: dict = Depends(get_current_user)):
    coupons = await db.personalized_coupons.find({"user_id": user["id"], "is_active": True}, {"_id": 0}).to_list(200)
    today = datetime.now(timezone.utc).date().isoformat()
    out = []
    for c in coupons:
        if c.get("used_count", 0) >= c.get("usage_limit", 1):
            continue
        if c.get("expiry") and c["expiry"] < today:
            continue
        if location_id and c.get("location_ids") and location_id not in c["location_ids"]:
            continue
        out.append(c)
    return out


@router.get("/me/buy-again")
async def buy_again(location_id: str, user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"user_id": user["id"], "status": {"$ne": "cancelled"}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    stats = {}
    for idx, o in enumerate(orders):
        for it in o.get("items", []):
            s = stats.setdefault(it["product_id"], {"count": 0, "qty": 0, "recency": idx})
            s["count"] += 1
            s["qty"] += it.get("quantity", 1)
            s["recency"] = min(s["recency"], idx)
    pids = list(stats.keys())
    if not pids:
        return []
    products = await db.products.find({"id": {"$in": pids}, "is_active": True, "location_ids": location_id}, {"_id": 0}).to_list(500)
    result = []
    for p in products:
        inv = await db.inventory.find_one({"product_id": p["id"], "location_id": location_id}, {"_id": 0})
        if not inv or inv["available_quantity"] <= 0:
            continue
        p["stock"] = inv["available_quantity"]
        p["in_stock"] = True
        p["discount_percent"] = round((p["mrp"] - p["selling_price"]) / p["mrp"] * 100) if p.get("mrp", 0) > p.get("selling_price", 0) else 0
        st = stats[p["id"]]
        p["_score"] = st["count"] * 10 - st["recency"]
        result.append(p)
    result.sort(key=lambda x: x["_score"], reverse=True)
    for p in result:
        p.pop("_score", None)
    return result[:12]


@router.get("/me/personalized-home")
async def personalized_home(location_id: str, user: dict = Depends(get_current_user)):
    offers = await my_offers(location_id, user)
    again = await buy_again(location_id, user)
    return {"offers": offers, "buy_again": again, "has_history": len(again) > 0}
