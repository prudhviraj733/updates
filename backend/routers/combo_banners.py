from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin
from models import ComboBannerInput, gen_id, now_iso

router = APIRouter()

MAX_BANNERS = 5


async def _enrich(banner: dict) -> dict:
    if banner.get("package_id"):
        pkg = await db.packages.find_one({"id": banner["package_id"]}, {"_id": 0})
        if pkg:
            total = 0.0
            for pid in pkg.get("product_ids", []):
                p = await db.products.find_one({"id": pid}, {"_id": 0, "selling_price": 1})
                if p:
                    total += p.get("selling_price", 0)
            banner["package"] = {
                "id": pkg["id"], "name": pkg["name"], "price": pkg.get("price", 0),
                "package_type": pkg.get("package_type"),
                "items_value": round(total, 2),
                "savings": round(max(0, total - pkg.get("price", 0)), 2),
                "item_count": len(pkg.get("product_ids", [])),
            }
    return banner


@router.get("/combo-banners")
async def list_banners(location_id: str = None):
    banners = await db.combo_banners.find({"is_active": True}, {"_id": 0}).to_list(200)
    if location_id:
        banners = [b for b in banners if not b.get("location_ids") or location_id in b["location_ids"]]
    banners.sort(key=lambda b: b.get("display_order", 0))
    banners = banners[:MAX_BANNERS]
    return [await _enrich(b) for b in banners]


@router.get("/admin/combo-banners")
async def admin_list_banners(admin: dict = Depends(require_admin)):
    banners = await db.combo_banners.find({}, {"_id": 0}).to_list(500)
    banners.sort(key=lambda b: b.get("display_order", 0))
    return [await _enrich(b) for b in banners]


@router.post("/admin/combo-banners")
async def create_banner(payload: ComboBannerInput, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc.update({"id": gen_id(), "created_at": now_iso(), "updated_at": now_iso()})
    await db.combo_banners.insert_one(doc)
    doc.pop("_id", None)
    return await _enrich(doc)


@router.put("/admin/combo-banners/{banner_id}")
async def update_banner(banner_id: str, payload: ComboBannerInput, admin: dict = Depends(require_admin)):
    data = payload.model_dump()
    data["updated_at"] = now_iso()
    res = await db.combo_banners.update_one({"id": banner_id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Banner not found")
    return await _enrich(await db.combo_banners.find_one({"id": banner_id}, {"_id": 0}))


@router.delete("/admin/combo-banners/{banner_id}")
async def delete_banner(banner_id: str, admin: dict = Depends(require_admin)):
    res = await db.combo_banners.delete_one({"id": banner_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Banner not found")
    return {"message": "Banner deleted"}
