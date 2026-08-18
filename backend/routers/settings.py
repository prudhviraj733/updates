from fastapi import APIRouter, Depends

from core.db import db
from core.security import require_admin
from models import BusinessSettingsInput, now_iso

router = APIRouter()

DEFAULTS = {
    "store_name": "Freshly Grocery",
    "support_phone": "+91 90000 00000",
    "support_email": "support@freshly.example",
    "currency": "INR",
    "cod_enabled": True,
    "online_payment_enabled": True,
    "cashback_enabled": True,
    "cashback_percent": 2.0,
    "cashback_max": 50.0,
    "milestone_enabled": True,
    "milestone_rewards": {"5": 100, "10": 250},
    "withdrawals_enabled": True,
    "min_withdrawal": 100.0,
    "withdrawable_sources": ["topup", "refund"],
    "loyalty_enabled": True,
    "loyalty_tiers": [
        {"name": "Bronze", "min_orders": 0, "cashback_percent": 2},
        {"name": "Silver", "min_orders": 5, "cashback_percent": 3},
        {"name": "Gold", "min_orders": 15, "cashback_percent": 5},
    ],
}


def loyalty_tier_for(order_count: int, settings: dict):
    """Return (current_tier, next_tier) for a delivered-order count."""
    tiers = sorted(settings.get("loyalty_tiers", []) or [], key=lambda t: t.get("min_orders", 0))
    current, nxt = (tiers[0] if tiers else None), None
    for t in tiers:
        if order_count >= t.get("min_orders", 0):
            current = t
        elif nxt is None:
            nxt = t
    return current, nxt


async def load_settings() -> dict:
    s = await db.business_settings.find_one({"key": "global"}, {"_id": 0})
    if not s:
        return {**DEFAULTS, "key": "global"}
    return {**DEFAULTS, **s}


@router.get("/settings")
async def public_settings():
    s = await load_settings()
    s.pop("key", None)
    return s


@router.get("/admin/settings")
async def admin_settings(admin: dict = Depends(require_admin)):
    return await load_settings()


@router.put("/admin/settings")
async def update_settings(payload: BusinessSettingsInput, admin: dict = Depends(require_admin)):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    data["updated_at"] = now_iso()
    await db.business_settings.update_one({"key": "global"}, {"$set": data}, upsert=True)
    return await load_settings()
