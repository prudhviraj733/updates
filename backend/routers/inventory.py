from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin
from models import InventoryInput, BulkEnableInput, CopyInventoryInput, gen_id, now_iso

router = APIRouter()


async def resolve_stock(product_id: str, pincode: Optional[str] = None, location_id: Optional[str] = None):
    """Return (available_qty, inv_doc). Prefer PIN-level inventory; fall back to legacy location-level.
    Disabled rows report 0 available."""
    inv = None
    if pincode:
        inv = await db.inventory.find_one({"product_id": product_id, "pincode": pincode}, {"_id": 0})
    if inv is None and location_id:
        inv = (await db.inventory.find_one(
                   {"product_id": product_id, "location_id": location_id, "pincode": {"$exists": False}}, {"_id": 0})
               or await db.inventory.find_one({"product_id": product_id, "location_id": location_id}, {"_id": 0}))
    if not inv:
        return 0, None
    if inv.get("enabled") is False:
        return 0, inv
    return inv.get("available_quantity", 0), inv


async def is_available(product_id: str, pincode: Optional[str] = None, location_id: Optional[str] = None) -> bool:
    if pincode:
        inv = await db.inventory.find_one({"product_id": product_id, "pincode": pincode}, {"_id": 0})
        return bool(inv) and inv.get("enabled") is not False
    return True


# ---- Admin ----
@router.get("/admin/inventory")
async def list_inventory(pincode: Optional[str] = None, location_id: Optional[str] = None,
                         admin: dict = Depends(require_admin)):
    """PIN-level listing when pincode given; else legacy location listing."""
    if pincode:
        pin = await db.pincodes.find_one({"pincode": pincode}, {"_id": 0})
        products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(5000)
        rows = []
        for p in products:
            inv = await db.inventory.find_one({"product_id": p["id"], "pincode": pincode}, {"_id": 0})
            available = inv.get("available_quantity", 0) if inv else 0
            low_th = inv.get("low_stock_threshold", 5) if inv else 5
            rows.append({
                "product_id": p["id"], "product_name": p["name"], "sku": p.get("sku", ""),
                "pack_size": p.get("pack_size", ""), "pincode": pincode,
                "enabled": (inv.get("enabled", True) if inv else False),
                "configured": inv is not None,
                "available_quantity": available, "reserved_quantity": inv.get("reserved_quantity", 0) if inv else 0,
                "sold_quantity": inv.get("sold_quantity", 0) if inv else 0,
                "low_stock_threshold": low_th,
                "out_of_stock": available <= 0, "low_stock": 0 < available <= low_th,
            })
        rows.sort(key=lambda r: r["product_name"])
        return rows

    query = {}
    if location_id:
        query["location_id"] = location_id
    inv = await db.inventory.find(query, {"_id": 0}).to_list(5000)
    for item in inv:
        product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0, "name": 1, "sku": 1, "pack_size": 1})
        item["product_name"] = product["name"] if product else "Unknown"
        item["sku"] = product.get("sku", "") if product else ""
        item["pack_size"] = product.get("pack_size", "") if product else ""
        item["enabled"] = item.get("enabled", True)
        item["out_of_stock"] = item["available_quantity"] <= 0
        item["low_stock"] = 0 < item["available_quantity"] <= item.get("low_stock_threshold", 5)
    return inv


@router.get("/admin/inventory/summary")
async def inventory_summary(admin: dict = Depends(require_admin)):
    """Per-PIN stats: products enabled, out-of-stock, low-stock + serviceability + delivery charge."""
    pins = await db.pincodes.find({}, {"_id": 0}).to_list(5000)
    locs = {l["id"]: l for l in await db.locations.find({}, {"_id": 0}).to_list(500)}
    out = []
    for pin in pins:
        rows = await db.inventory.find({"pincode": pin["pincode"]}, {"_id": 0}).to_list(5000)
        enabled = [r for r in rows if r.get("enabled", True)]
        oos = [r for r in enabled if r.get("available_quantity", 0) <= 0]
        low = [r for r in enabled if 0 < r.get("available_quantity", 0) <= r.get("low_stock_threshold", 5)]
        loc = locs.get(pin.get("location_id"))
        out.append({
            "pincode": pin["pincode"], "area_name": pin.get("area_name", ""),
            "location_id": pin.get("location_id"), "location_name": loc["name"] if loc else "—",
            "is_serviceable": pin.get("is_serviceable", False),
            "delivery_charge": pin.get("delivery_charge"),
            "products_enabled": len(enabled), "out_of_stock": len(oos), "low_stock": len(low),
        })
    out.sort(key=lambda r: r["pincode"])
    return out


@router.put("/admin/inventory")
async def upsert_inventory(payload: InventoryInput, admin: dict = Depends(require_admin)):
    if not payload.pincode and not payload.location_id:
        raise HTTPException(status_code=400, detail="pincode or location_id required")
    key = {"product_id": payload.product_id}
    if payload.pincode:
        key["pincode"] = payload.pincode
        # keep parent location on the row for grouping
        pin = await db.pincodes.find_one({"pincode": payload.pincode}, {"_id": 0})
        loc_id = pin["location_id"] if pin else payload.location_id
    else:
        key["location_id"] = payload.location_id
        key["pincode"] = {"$exists": False}
        loc_id = payload.location_id
    existing = await db.inventory.find_one(key)
    fields = {"available_quantity": payload.available_quantity,
              "low_stock_threshold": payload.low_stock_threshold,
              "enabled": payload.enabled, "updated_at": now_iso()}
    if existing:
        await db.inventory.update_one({"_id": existing["_id"]}, {"$set": fields})
    else:
        doc = {"id": gen_id(), "product_id": payload.product_id, "reserved_quantity": 0,
               "sold_quantity": 0, **fields}
        if payload.pincode:
            doc["pincode"] = payload.pincode
        doc["location_id"] = loc_id
        await db.inventory.insert_one(doc)
    q = {"product_id": payload.product_id}
    q["pincode"] = payload.pincode if payload.pincode else {"$exists": False}
    if not payload.pincode:
        q["location_id"] = payload.location_id
    return await db.inventory.find_one(q, {"_id": 0})


@router.post("/admin/inventory/enable-all")
async def enable_all(payload: BulkEnableInput, admin: dict = Depends(require_admin)):
    """Enable (or disable) every active product for one/many/all serviceable PIN codes."""
    if payload.all_serviceable:
        pins = [p["pincode"] for p in await db.pincodes.find(
            {"is_serviceable": True}, {"_id": 0, "pincode": 1}).to_list(5000)]
    else:
        pins = payload.pincodes
    if not pins:
        raise HTTPException(status_code=400, detail="No PIN codes selected")
    products = await db.products.find({"is_active": True}, {"_id": 0, "id": 1}).to_list(5000)
    affected = 0
    for pc in pins:
        pin = await db.pincodes.find_one({"pincode": pc}, {"_id": 0})
        loc_id = pin["location_id"] if pin else None
        for p in products:
            existing = await db.inventory.find_one({"product_id": p["id"], "pincode": pc})
            fields = {"enabled": payload.enabled, "updated_at": now_iso()}
            if payload.set_stock is not None:
                fields["available_quantity"] = payload.set_stock
            if existing:
                await db.inventory.update_one({"_id": existing["_id"]}, {"$set": fields})
            else:
                await db.inventory.insert_one({
                    "id": gen_id(), "product_id": p["id"], "pincode": pc, "location_id": loc_id,
                    "available_quantity": payload.set_stock if payload.set_stock is not None else 0,
                    "reserved_quantity": 0, "sold_quantity": 0, "low_stock_threshold": 5,
                    "enabled": payload.enabled, "updated_at": now_iso(),
                })
            affected += 1
    return {"pincodes": pins, "products": len(products), "rows_affected": affected}


@router.post("/admin/inventory/copy")
async def copy_inventory(payload: CopyInventoryInput, admin: dict = Depends(require_admin)):
    """Copy one PIN's full stock/availability setup to one or more other PIN codes."""
    src = await db.inventory.find({"pincode": payload.from_pincode}, {"_id": 0}).to_list(20000)
    if not src:
        raise HTTPException(status_code=400, detail="Source PIN has no inventory configured")
    copied = 0
    for dest in payload.to_pincodes:
        if dest == payload.from_pincode:
            continue
        pin = await db.pincodes.find_one({"pincode": dest}, {"_id": 0})
        loc_id = pin["location_id"] if pin else None
        for row in src:
            fields = {"available_quantity": row.get("available_quantity", 0),
                      "enabled": row.get("enabled", True),
                      "low_stock_threshold": row.get("low_stock_threshold", 5),
                      "updated_at": now_iso()}
            existing = await db.inventory.find_one({"product_id": row["product_id"], "pincode": dest})
            if existing:
                await db.inventory.update_one({"_id": existing["_id"]}, {"$set": fields})
            else:
                await db.inventory.insert_one({"id": gen_id(), "product_id": row["product_id"],
                                               "pincode": dest, "location_id": loc_id,
                                               "reserved_quantity": 0, "sold_quantity": 0, **fields})
            copied += 1
    return {"copied": copied, "to": payload.to_pincodes}
