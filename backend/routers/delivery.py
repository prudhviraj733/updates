from datetime import datetime, timedelta

import pytz
from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin
from models import DeliverySettingsInput

router = APIRouter()

IST = pytz.timezone("Asia/Kolkata")

DEFAULT_SETTINGS = {
    "operating_start": "09:00", "operating_end": "21:00", "slot_duration_minutes": 60,
    "prep_time_minutes": 90, "max_orders_per_slot": 10, "asap_enabled": True,
    "asap_charge": 100, "holidays": [],
}


async def get_settings(location_id: str) -> dict:
    s = await db.delivery_settings.find_one({"location_id": location_id}, {"_id": 0})
    if not s:
        s = {**DEFAULT_SETTINGS, "location_id": location_id}
    return s


def _parse_hm(hm: str):
    h, m = hm.split(":")
    return int(h), int(m)


async def compute_slots(location_id: str, date_str: str) -> dict:
    s = await get_settings(location_id)
    now = datetime.now(IST)
    target_date = datetime.strptime(date_str, "%Y-%m-%d").date()

    result = {"date": date_str, "slots": [], "asap": {"enabled": False, "charge": s["asap_charge"]}}

    if date_str in s.get("holidays", []):
        return result

    oh, om = _parse_hm(s["operating_start"])
    ch, cm = _parse_hm(s["operating_end"])
    open_dt = IST.localize(datetime.combine(target_date, datetime.min.time()).replace(hour=oh, minute=om))
    close_dt = IST.localize(datetime.combine(target_date, datetime.min.time()).replace(hour=ch, minute=cm))

    earliest = now + timedelta(minutes=s["prep_time_minutes"])

    duration = s["slot_duration_minutes"]
    cur = open_dt
    while cur + timedelta(minutes=duration) <= close_dt:
        slot_end = cur + timedelta(minutes=duration)
        slot_id = f"{date_str}_{cur.strftime('%H:%M')}"
        available = True
        reason = None
        if cur < earliest:
            available = False
            reason = "past_leadtime"
        if available:
            count = await db.orders.count_documents(
                {"location_id": location_id, "slot_id": slot_id, "status": {"$ne": "cancelled"}})
            if count >= s["max_orders_per_slot"]:
                available = False
                reason = "full"
        result["slots"].append({
            "id": slot_id,
            "start": cur.strftime("%H:%M"),
            "end": slot_end.strftime("%H:%M"),
            "label": f"{cur.strftime('%I:%M %p')} - {slot_end.strftime('%I:%M %p')}",
            "available": available,
            "reason": reason,
        })
        cur = slot_end

    # ASAP available only for today while store still operating and prep window fits
    if (s.get("asap_enabled") and target_date == now.date()
            and earliest <= close_dt and now >= open_dt - timedelta(minutes=s["prep_time_minutes"])):
        result["asap"] = {"enabled": True, "charge": s["asap_charge"],
                          "eta": earliest.strftime("%I:%M %p")}
    return result


@router.get("/delivery/settings")
async def public_settings(location_id: str):
    return await get_settings(location_id)


@router.get("/delivery/slots")
async def slots(location_id: str, date: str):
    return await compute_slots(location_id, date)


@router.get("/delivery/slots/range")
async def slots_range(location_id: str, days: int = 3):
    now = datetime.now(IST).date()
    out = []
    for i in range(max(1, min(days, 7))):
        d = (now + timedelta(days=i)).strftime("%Y-%m-%d")
        out.append(await compute_slots(location_id, d))
    return {"days": out}


# ---- Admin ----
@router.get("/admin/delivery/settings")
async def admin_get_settings(location_id: str, admin: dict = Depends(require_admin)):
    return await get_settings(location_id)


@router.put("/admin/delivery/settings")
async def admin_update_settings(location_id: str, payload: DeliverySettingsInput, admin: dict = Depends(require_admin)):
    data = payload.model_dump()
    data["location_id"] = location_id
    await db.delivery_settings.update_one({"location_id": location_id}, {"$set": data}, upsert=True)
    return await get_settings(location_id)
