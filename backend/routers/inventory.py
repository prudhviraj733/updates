from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin
from models import InventoryInput, gen_id, now_iso

router = APIRouter()


@router.get("/admin/inventory")
async def list_inventory(location_id: Optional[str] = None, admin: dict = Depends(require_admin)):
    query = {}
    if location_id:
        query["location_id"] = location_id
    inv = await db.inventory.find(query, {"_id": 0}).to_list(5000)
    for item in inv:
        product = await db.products.find_one({"id": item["product_id"]}, {"_id": 0, "name": 1, "sku": 1, "pack_size": 1})
        item["product_name"] = product["name"] if product else "Unknown"
        item["sku"] = product.get("sku", "") if product else ""
        item["pack_size"] = product.get("pack_size", "") if product else ""
        item["out_of_stock"] = item["available_quantity"] <= 0
        item["low_stock"] = 0 < item["available_quantity"] <= item.get("low_stock_threshold", 5)
    return inv


@router.put("/admin/inventory")
async def upsert_inventory(payload: InventoryInput, admin: dict = Depends(require_admin)):
    existing = await db.inventory.find_one({"product_id": payload.product_id, "location_id": payload.location_id})
    if existing:
        await db.inventory.update_one(
            {"product_id": payload.product_id, "location_id": payload.location_id},
            {"$set": {"available_quantity": payload.available_quantity,
                      "low_stock_threshold": payload.low_stock_threshold,
                      "updated_at": now_iso()}},
        )
    else:
        await db.inventory.insert_one({
            "id": gen_id(), "product_id": payload.product_id, "location_id": payload.location_id,
            "available_quantity": payload.available_quantity, "reserved_quantity": 0,
            "sold_quantity": 0, "low_stock_threshold": payload.low_stock_threshold,
            "updated_at": now_iso(),
        })
    return await db.inventory.find_one(
        {"product_id": payload.product_id, "location_id": payload.location_id}, {"_id": 0})
