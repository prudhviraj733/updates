from typing import Optional

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin
from models import (InventoryInput, InventoryBatchInput, BulkEnableInput,
                    CopyInventoryInput, gen_id, now_iso)

router = APIRouter()

EXPIRY_SOON_DAYS = 30
EXPIRY_VERY_SOON_DAYS = 7


def _expiry_status(expiry_date):
    if not expiry_date:
        return {"status": "none", "days": None, "expiry_date": None}
    try:
        d = datetime.strptime(str(expiry_date)[:10], "%Y-%m-%d").date()
    except Exception:
        return {"status": "none", "days": None, "expiry_date": None}
    days = (d - date.today()).days
    if days < 0:
        status = "expired"
    elif days <= EXPIRY_VERY_SOON_DAYS:
        status = "very_soon"
    elif days <= EXPIRY_SOON_DAYS:
        status = "soon"
    else:
        status = "normal"
    return {"status": status, "days": days, "expiry_date": str(expiry_date)[:10]}


def _active_batches(batches):
    return [b for b in (batches or []) if (b.get("quantity", 0) or 0) > 0]


def _batch_summary(batches):
    active = _active_batches(batches)
    dated = [b for b in active if b.get("expiry_date")]
    if not dated:
        return {"nearest_expiry": None, "expiry_status": "none", "expiry_days": None, "batch_count": len(active)}
    nearest = min(dated, key=lambda b: str(b["expiry_date"])[:10])
    es = _expiry_status(nearest["expiry_date"])
    return {"nearest_expiry": es["expiry_date"], "expiry_status": es["status"],
            "expiry_days": es["days"], "batch_count": len(active)}


def _batches_out(batches):
    return [{**b, "expiry": _expiry_status(b.get("expiry_date"))} for b in (batches or [])]


async def _batch_key(product_id, pincode, location_id):
    if pincode:
        pin = await db.pincodes.find_one({"pincode": pincode}, {"_id": 0})
        return {"product_id": product_id, "pincode": pincode}, (pin["location_id"] if pin else location_id)
    return {"product_id": product_id, "location_id": location_id, "pincode": {"$exists": False}}, location_id


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
            batches = inv.get("batches", []) if inv else []
            row = {
                "product_id": p["id"], "product_name": p["name"], "sku": p.get("sku", ""),
                "pack_size": p.get("pack_size", ""), "pincode": pincode,
                "enabled": (inv.get("enabled", True) if inv else False),
                "configured": inv is not None,
                "available_quantity": available, "reserved_quantity": inv.get("reserved_quantity", 0) if inv else 0,
                "sold_quantity": inv.get("sold_quantity", 0) if inv else 0,
                "low_stock_threshold": low_th,
                "out_of_stock": available <= 0, "low_stock": 0 < available <= low_th,
                "batches": _batches_out(batches),
            }
            row.update(_batch_summary(batches))
            rows.append(row)
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
        batches = item.get("batches", [])
        item["batches"] = _batches_out(batches)
        item.update(_batch_summary(batches))
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
    available = payload.available_quantity
    if existing and existing.get("batches"):
        # Batched rows: available is derived from the batch ledger, never overwritten by an absolute save
        available = sum(int(b.get("quantity", 0) or 0) for b in existing["batches"])
    fields = {"available_quantity": available,
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


@router.post("/admin/inventory/batch")
async def add_batch(payload: InventoryBatchInput, admin: dict = Depends(require_admin)):
    if payload.quantity is None or payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")
    if not payload.pincode and not payload.location_id:
        raise HTTPException(status_code=400, detail="pincode or location_id required")
    if not payload.batch_number or not payload.batch_number.strip():
        raise HTTPException(status_code=400, detail="Batch number is required")
    key, loc_id = await _batch_key(payload.product_id, payload.pincode, payload.location_id)
    batch = {"id": gen_id(), "batch_number": payload.batch_number.strip(), "quantity": int(payload.quantity),
             "purchase_price": (round(float(payload.purchase_price), 2) if payload.purchase_price is not None else None),
             "expiry_date": str(payload.expiry_date)[:10] if payload.expiry_date else None, "added_at": now_iso()}
    existing = await db.inventory.find_one(key)
    if existing:
        cur = existing.get("batches") or []
        batch_sum = sum(int(b.get("quantity", 0) or 0) for b in cur)
        legacy_remainder = int(existing.get("available_quantity", 0) or 0) - batch_sum
        push = [batch]
        if legacy_remainder > 0:
            # Fold pre-existing non-batch stock into a LEGACY batch so batches == available_quantity
            push = [{"id": gen_id(), "batch_number": "LEGACY", "quantity": legacy_remainder,
                     "expiry_date": None, "purchase_price": None, "added_at": now_iso()}, batch]
        upd = {"$push": {"batches": {"$each": push}}, "$inc": {"available_quantity": int(payload.quantity)},
               "$set": {"updated_at": now_iso()}}
        if payload.low_stock_threshold is not None:
            upd["$set"]["low_stock_threshold"] = int(payload.low_stock_threshold)
        await db.inventory.update_one({"_id": existing["_id"]}, upd)
    else:
        doc = {"id": gen_id(), "product_id": payload.product_id, "available_quantity": int(payload.quantity),
               "reserved_quantity": 0, "sold_quantity": 0, "enabled": True, "batches": [batch],
               "low_stock_threshold": int(payload.low_stock_threshold) if payload.low_stock_threshold is not None else 5,
               "updated_at": now_iso()}
        if payload.pincode:
            doc["pincode"] = payload.pincode
        doc["location_id"] = loc_id
        await db.inventory.insert_one(doc)
    return await db.inventory.find_one(key, {"_id": 0})


@router.delete("/admin/inventory/batch/{batch_id}")
async def delete_batch(batch_id: str, product_id: str, pincode: Optional[str] = None,
                       location_id: Optional[str] = None, admin: dict = Depends(require_admin)):
    key, _ = await _batch_key(product_id, pincode, location_id)
    row = await db.inventory.find_one({**key, "batches.id": batch_id})
    if not row:
        raise HTTPException(status_code=404, detail="Batch not found")
    batch = next((b for b in row.get("batches", []) if b.get("id") == batch_id), None)
    qty = int(batch.get("quantity", 0)) if batch else 0
    dec = min(qty, row.get("available_quantity", 0))
    await db.inventory.update_one({"_id": row["_id"]},
        {"$pull": {"batches": {"id": batch_id}}, "$inc": {"available_quantity": -dec},
         "$set": {"updated_at": now_iso()}})
    return await db.inventory.find_one({"_id": row["_id"]}, {"_id": 0})


@router.get("/admin/inventory/expiry-summary")
async def expiry_summary(pincode: Optional[str] = None, location_id: Optional[str] = None,
                         admin: dict = Depends(require_admin)):
    query = {}
    if pincode:
        query["pincode"] = pincode
    elif location_id:
        query["location_id"] = location_id
    active_ids = set(p["id"] for p in await db.products.find({"is_active": True}, {"_id": 0, "id": 1}).to_list(20000))
    rows = await db.inventory.find(query, {"_id": 0}).to_list(20000)
    total = low = out = exp30 = exp7 = expired = 0
    for r in rows:
        if r.get("product_id") not in active_ids:
            continue
        if not r.get("enabled", True):
            continue
        total += 1
        avail = r.get("available_quantity", 0)
        th = r.get("low_stock_threshold", 5)
        if avail <= 0:
            out += 1
        elif avail <= th:
            low += 1
        s = _batch_summary(r.get("batches", []))["expiry_status"]
        if s == "expired":
            expired += 1
        elif s == "very_soon":
            exp7 += 1
            exp30 += 1
        elif s == "soon":
            exp30 += 1
    return {"total_inventory": total, "low_stock": low, "out_of_stock": out,
            "expiring_30": exp30, "expiring_7": exp7, "expired": expired}
