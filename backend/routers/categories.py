from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin
from models import CategoryInput, gen_id, now_iso

router = APIRouter()


@router.get("/categories")
async def list_categories():
    docs = await db.categories.find({"is_active": True}, {"_id": 0}).to_list(500)
    docs.sort(key=lambda d: d.get("display_order", 0))
    return docs


@router.get("/admin/categories")
async def admin_list_categories(admin: dict = Depends(require_admin)):
    docs = await db.categories.find({}, {"_id": 0}).to_list(500)
    docs.sort(key=lambda d: d.get("display_order", 0))
    return docs


@router.post("/admin/categories")
async def create_category(payload: CategoryInput, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc.update({"id": gen_id(), "created_at": now_iso(), "updated_at": now_iso()})
    await db.categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/admin/categories/{category_id}")
async def update_category(category_id: str, payload: CategoryInput, admin: dict = Depends(require_admin)):
    data = payload.model_dump()
    data["updated_at"] = now_iso()
    res = await db.categories.update_one({"id": category_id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return await db.categories.find_one({"id": category_id}, {"_id": 0})


@router.delete("/admin/categories/{category_id}")
async def delete_category(category_id: str, admin: dict = Depends(require_admin)):
    await db.categories.update_one({"id": category_id}, {"$set": {"is_active": False}})
    return {"message": "Category deactivated"}
