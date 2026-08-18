from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin
from models import BrandInput, gen_id, now_iso

router = APIRouter()


@router.get("/brands")
async def list_brands():
    docs = await db.brands.find({"is_active": True}, {"_id": 0}).to_list(500)
    docs.sort(key=lambda d: d.get("display_order", 0))
    return docs


@router.get("/admin/brands")
async def admin_list_brands(admin: dict = Depends(require_admin)):
    docs = await db.brands.find({}, {"_id": 0}).to_list(500)
    docs.sort(key=lambda d: d.get("display_order", 0))
    return docs


@router.post("/admin/brands")
async def create_brand(payload: BrandInput, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc.update({"id": gen_id(), "created_at": now_iso(), "updated_at": now_iso()})
    await db.brands.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/admin/brands/{brand_id}")
async def update_brand(brand_id: str, payload: BrandInput, admin: dict = Depends(require_admin)):
    data = payload.model_dump()
    data["updated_at"] = now_iso()
    res = await db.brands.update_one({"id": brand_id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Brand not found")
    return await db.brands.find_one({"id": brand_id}, {"_id": 0})


@router.delete("/admin/brands/{brand_id}")
async def delete_brand(brand_id: str, admin: dict = Depends(require_admin)):
    await db.brands.update_one({"id": brand_id}, {"$set": {"is_active": False}})
    return {"message": "Brand deactivated"}
