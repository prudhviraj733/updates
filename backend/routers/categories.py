import re

from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin
from models import CategoryInput, gen_id, now_iso

router = APIRouter()


def _dedupe_by_name(docs):
    """Collapse duplicate categories/subcategories by (name, parent_id), keeping the first."""
    seen = {}
    out = []
    for d in docs:
        key = (d.get("name", "").strip().lower(), d.get("parent_id"))
        if key in seen:
            continue
        seen[key] = True
        out.append(d)
    return out


@router.get("/categories")
async def list_categories():
    docs = await db.categories.find({"is_active": True, "parent_id": None}, {"_id": 0}).to_list(500)
    docs.sort(key=lambda d: d.get("display_order", 0))
    return _dedupe_by_name(docs)


@router.get("/subcategories")
async def list_subcategories(category_id: str = None):
    query = {"is_active": True, "parent_id": {"$ne": None}}
    if category_id:
        query["parent_id"] = category_id
    docs = await db.categories.find(query, {"_id": 0}).to_list(1000)
    docs.sort(key=lambda d: d.get("display_order", 0))
    return _dedupe_by_name(docs)


@router.get("/admin/subcategories")
async def admin_list_subcategories(admin: dict = Depends(require_admin)):
    docs = await db.categories.find({"parent_id": {"$ne": None}}, {"_id": 0}).to_list(2000)
    docs.sort(key=lambda d: d.get("display_order", 0))
    return docs


@router.get("/admin/categories")
async def admin_list_categories(admin: dict = Depends(require_admin)):
    docs = await db.categories.find({"parent_id": None}, {"_id": 0}).to_list(500)
    docs.sort(key=lambda d: d.get("display_order", 0))
    return docs


@router.post("/admin/categories")
async def create_category(payload: CategoryInput, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    name = doc["name"].strip()
    dup = await db.categories.find_one({
        "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
        "parent_id": doc.get("parent_id"),
    })
    if dup:
        label = "Subcategory" if doc.get("parent_id") else "Category"
        raise HTTPException(status_code=400, detail=f"{label} '{name}' already exists here")
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
