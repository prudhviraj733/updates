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
}


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
