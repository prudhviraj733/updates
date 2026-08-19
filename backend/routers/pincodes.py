from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin
from models import PinCodeInput, gen_id, now_iso

router = APIRouter()


@router.get("/pincodes/check")
async def check_pincode(pincode: str):
    """Public serviceability check. Returns parent location + rules if serviceable."""
    doc = await db.pincodes.find_one({"pincode": pincode.strip()}, {"_id": 0})
    if not doc or not doc.get("is_serviceable"):
        return {"serviceable": False, "pincode": pincode.strip()}
    loc = await db.locations.find_one({"id": doc["location_id"], "is_active": True}, {"_id": 0})
    if not loc:
        return {"serviceable": False, "pincode": pincode.strip()}
    return {
        "serviceable": True,
        "pincode": doc["pincode"],
        "location": loc,
        "asap_enabled": doc.get("asap_enabled", True),
        "min_order_value": doc.get("min_order_value") or loc.get("min_order_value", 0),
        "delivery_charge": doc["delivery_charge"] if doc.get("delivery_charge") is not None else loc.get("delivery_charge", 0),
        "free_delivery_threshold": doc.get("free_delivery_threshold"),
        "discount_type": doc.get("discount_type"),
        "discount_value": doc.get("discount_value", 0),
        "max_discount": doc.get("max_discount"),
    }


# ---- Admin ----
@router.get("/admin/pincodes")
async def admin_list_pincodes(location_id: str = None, admin: dict = Depends(require_admin)):
    query = {"location_id": location_id} if location_id else {}
    docs = await db.pincodes.find(query, {"_id": 0}).to_list(5000)
    docs.sort(key=lambda d: d.get("pincode", ""))
    return docs


@router.post("/admin/pincodes")
async def create_pincode(payload: PinCodeInput, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["pincode"] = doc["pincode"].strip()
    if await db.pincodes.find_one({"pincode": doc["pincode"]}):
        raise HTTPException(status_code=400, detail="PIN code already exists")
    if not await db.locations.find_one({"id": doc["location_id"]}):
        raise HTTPException(status_code=400, detail="Invalid parent location")
    doc.update({"id": gen_id(), "created_at": now_iso(), "updated_at": now_iso()})
    await db.pincodes.insert_one(doc)
    doc.pop("_id", None)
    # Provision PIN-level inventory so products are immediately available for this new PIN
    loc_id = doc["location_id"]
    prods = await db.products.find({"is_active": True}, {"_id": 0, "id": 1}).to_list(5000)
    for p in prods:
        if await db.inventory.find_one({"product_id": p["id"], "pincode": doc["pincode"]}):
            continue
        loc_inv = await db.inventory.find_one(
            {"product_id": p["id"], "location_id": loc_id, "pincode": {"$exists": False}}, {"_id": 0})
        await db.inventory.insert_one({
            "id": gen_id(), "product_id": p["id"], "pincode": doc["pincode"], "location_id": loc_id,
            "available_quantity": (loc_inv.get("available_quantity", 0) if loc_inv else 0),
            "reserved_quantity": 0, "sold_quantity": 0, "low_stock_threshold": 5,
            "enabled": True, "updated_at": now_iso(),
        })
    return doc


@router.put("/admin/pincodes/{pincode_id}")
async def update_pincode(pincode_id: str, payload: PinCodeInput, admin: dict = Depends(require_admin)):
    data = payload.model_dump()
    data["pincode"] = data["pincode"].strip()
    data["updated_at"] = now_iso()
    res = await db.pincodes.update_one({"id": pincode_id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="PIN code not found")
    return await db.pincodes.find_one({"id": pincode_id}, {"_id": 0})


@router.delete("/admin/pincodes/{pincode_id}")
async def delete_pincode(pincode_id: str, admin: dict = Depends(require_admin)):
    await db.pincodes.delete_one({"id": pincode_id})
    return {"message": "PIN code deleted"}
