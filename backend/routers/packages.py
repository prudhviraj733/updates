from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin
from models import PackageInput, gen_id, now_iso

router = APIRouter()


@router.get("/packages")
async def list_packages(location_id: str = None):
    query = {"is_active": True}
    if location_id:
        query["location_ids"] = location_id
    return await db.packages.find(query, {"_id": 0}).to_list(200)


@router.get("/packages/{package_id}")
async def get_package(package_id: str):
    pkg = await db.packages.find_one({"id": package_id, "is_active": True}, {"_id": 0})
    if not pkg:
        raise HTTPException(status_code=404, detail="Combo not found")
    swaps = pkg.get("swap_options", {}) or {}

    def summarize(p):
        return {"id": p["id"], "name": p["name"], "pack_size": p.get("pack_size", ""),
                "images": p.get("images", []), "selling_price": p.get("selling_price", 0),
                "mrp": p.get("mrp", 0)}

    products = []
    total = 0.0
    for pid in pkg.get("product_ids", []):
        p = await db.products.find_one({"id": pid, "is_active": True}, {"_id": 0})
        if not p:
            continue
        p["discount_percent"] = round((p["mrp"] - p["selling_price"]) / p["mrp"] * 100) if p.get("mrp", 0) > p.get("selling_price", 0) else 0
        # attach admin-approved swap alternatives
        alts = []
        for alt_id in swaps.get(pid, []):
            ap = await db.products.find_one({"id": alt_id, "is_active": True}, {"_id": 0})
            if ap:
                alts.append(summarize(ap))
        p["alternatives"] = alts
        p["swappable"] = len(alts) > 0
        products.append(p)
        total += p.get("selling_price", 0)
    pkg["products"] = products
    pkg["items_value"] = round(total, 2)
    pkg["savings"] = round(max(0, total - pkg.get("price", 0)), 2)
    return pkg


@router.get("/admin/packages")
async def admin_list_packages(admin: dict = Depends(require_admin)):
    return await db.packages.find({}, {"_id": 0}).to_list(500)


@router.post("/admin/packages")
async def create_package(payload: PackageInput, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc.update({"id": gen_id(), "created_at": now_iso(), "updated_at": now_iso()})
    await db.packages.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/admin/packages/{package_id}")
async def update_package(package_id: str, payload: PackageInput, admin: dict = Depends(require_admin)):
    data = payload.model_dump()
    data["updated_at"] = now_iso()
    res = await db.packages.update_one({"id": package_id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Package not found")
    return await db.packages.find_one({"id": package_id}, {"_id": 0})


@router.delete("/admin/packages/{package_id}")
async def delete_package(package_id: str, admin: dict = Depends(require_admin)):
    await db.packages.update_one({"id": package_id}, {"$set": {"is_active": False}})
    return {"message": "Package deactivated"}
