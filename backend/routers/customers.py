from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin

router = APIRouter()


@router.get("/admin/customers/{user_id}/full")
async def customer_360(user_id: str, admin: dict = Depends(require_admin)):
    try:
        u = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    except Exception:
        u = None
    if not u:
        raise HTTPException(status_code=404, detail="Customer not found")

    profile = {
        "id": user_id, "name": u.get("name"), "email": u.get("email"),
        "phone": u.get("phone"), "created_at": u.get("created_at"),
        "referral_code": u.get("referral_code"),
    }

    orders = await db.orders.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    valid = [o for o in orders if o.get("status") != "cancelled"]
    total_spend = sum(o.get("final_amount", 0) for o in valid)
    order_count = len(valid)
    aov = round(total_spend / order_count, 2) if order_count else 0

    # behaviour: favourite products & categories
    prod_counts, cat_counts = {}, {}
    for o in valid:
        for it in o.get("items", []):
            prod_counts[it.get("name", "?")] = prod_counts.get(it.get("name", "?"), 0) + it.get("quantity", 1)
            if it.get("category_id"):
                cat_counts[it["category_id"]] = cat_counts.get(it["category_id"], 0) + it.get("quantity", 1)
    cats = {c["id"]: c["name"] for c in await db.categories.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(2000)}
    fav_products = sorted(prod_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    fav_categories = sorted([(cats.get(k, "—"), v) for k, v in cat_counts.items()], key=lambda x: x[1], reverse=True)[:5]

    # addresses
    addresses = await db.addresses.find({"user_id": user_id}, {"_id": 0}).to_list(50)

    # coupons
    pcoupons = await db.personalized_coupons.find({"user_id": user_id}, {"_id": 0}).to_list(500)
    today = datetime.now(timezone.utc).date().isoformat()
    coupons = {
        "current": [c for c in pcoupons if c.get("is_active") and c.get("used_count", 0) < c.get("usage_limit", 1) and (not c.get("expiry") or c["expiry"] >= today)],
        "redeemed": [c for c in pcoupons if c.get("used_count", 0) > 0],
        "total": len(pcoupons),
    }

    # wallet
    wallet_ledger = await db.wallet_ledger.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    wallet_balance = round(sum(l.get("amount", 0) for l in wallet_ledger), 2)

    # referrals
    referrals = await db.referrals.find({"referrer_id": user_id}, {"_id": 0}).to_list(500)

    # abandoned carts (has items)
    carts = await db.carts.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    abandoned = []
    for c in carts:
        if not c.get("items"):
            continue
        value = 0.0
        for it in c["items"]:
            p = await db.products.find_one({"id": it["product_id"]}, {"_id": 0, "selling_price": 1, "name": 1})
            if p:
                value += p.get("selling_price", 0) * it.get("quantity", 1)
        abandoned.append({"location_id": c.get("location_id"), "item_count": len(c["items"]), "value": round(value, 2)})

    return {
        "profile": profile,
        "summary": {
            "order_count": order_count, "total_spend": round(total_spend, 2), "aov": aov,
            "cancelled_orders": len([o for o in orders if o.get("status") == "cancelled"]),
            "wallet_balance": wallet_balance, "referral_count": len(referrals),
        },
        "orders": orders[:100],
        "behaviour": {"favourite_products": fav_products, "favourite_categories": fav_categories},
        "addresses": addresses,
        "coupons": coupons,
        "wallet": {"balance": wallet_balance, "ledger": wallet_ledger},
        "referrals": referrals,
        "abandoned_carts": abandoned,
    }
