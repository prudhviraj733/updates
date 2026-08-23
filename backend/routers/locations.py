from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin
from models import LocationInput, DeliverySettingsInput, gen_id, now_iso

router = APIRouter()

DEFAULT_SETTINGS = {
    "operating_start": "09:00", "operating_end": "21:00", "slot_duration_minutes": 60,
    "prep_time_minutes": 90, "max_orders_per_slot": 10, "holidays": [],
}


@router.get("/locations")
async def list_locations():
    return await db.locations.find({"is_active": True}, {"_id": 0}).to_list(200)


@router.get("/locations/{location_id}")
async def get_location(location_id: str):
    loc = await db.locations.find_one({"id": location_id}, {"_id": 0})
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    return loc


# ---- Admin ----
@router.get("/admin/locations")
async def admin_list_locations(admin: dict = Depends(require_admin)):
    return await db.locations.find({}, {"_id": 0}).to_list(500)


@router.post("/admin/locations")
async def create_location(payload: LocationInput, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    lid = gen_id()
    doc.update({"id": lid, "created_at": now_iso(), "updated_at": now_iso()})
    await db.locations.insert_one(doc)
    settings = {**DEFAULT_SETTINGS, "location_id": lid}
    await db.delivery_settings.insert_one(settings)
    doc.pop("_id", None)
    return doc


@router.put("/admin/locations/{location_id}")
async def update_location(location_id: str, payload: LocationInput, admin: dict = Depends(require_admin)):
    data = payload.model_dump()
    data["updated_at"] = now_iso()
    res = await db.locations.update_one({"id": location_id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Location not found")
    return await db.locations.find_one({"id": location_id}, {"_id": 0})


@router.delete("/admin/locations/{location_id}")
async def delete_location(location_id: str, admin: dict = Depends(require_admin)):
    await db.locations.update_one({"id": location_id}, {"$set": {"is_active": False}})
    return {"message": "Location deactivated"}
