from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin
from models import CouponInput, CouponValidateInput, gen_id, now_iso

router = APIRouter()


def _calc_discount(coupon: dict, subtotal: float) -> float:
    if coupon["discount_type"] == "percentage":
        disc = subtotal * coupon["discount_value"] / 100
    else:
        disc = coupon["discount_value"]
    if coupon.get("max_discount"):
        disc = min(disc, coupon["max_discount"])
    return round(min(disc, subtotal), 2)


@router.post("/coupons/validate")
async def validate_coupon(payload: CouponValidateInput):
    coupon = await db.coupons.find_one({"code": payload.code.upper(), "is_active": True}, {"_id": 0})
    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid coupon code")
    now = datetime.now().isoformat()
    if coupon.get("start_date") and coupon["start_date"] > now:
        raise HTTPException(status_code=400, detail="Coupon not active yet")
    if coupon.get("end_date") and coupon["end_date"] < now:
        raise HTTPException(status_code=400, detail="Coupon expired")
    if coupon.get("location_ids") and payload.location_id not in coupon["location_ids"]:
        raise HTTPException(status_code=400, detail="Coupon not valid for this location")
    if payload.subtotal < coupon.get("min_order_value", 0):
        raise HTTPException(status_code=400, detail=f"Minimum order value ₹{coupon['min_order_value']} required")
    discount = _calc_discount(coupon, payload.subtotal)
    return {"code": coupon["code"], "discount": discount, "message": "Coupon applied"}


# ---- Admin ----
@router.get("/admin/coupons")
async def list_coupons(admin: dict = Depends(require_admin)):
    return await db.coupons.find({}, {"_id": 0}).to_list(500)


@router.post("/admin/coupons")
async def create_coupon(payload: CouponInput, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc["code"] = doc["code"].upper()
    if await db.coupons.find_one({"code": doc["code"]}):
        raise HTTPException(status_code=400, detail="Coupon code already exists")
    doc.update({"id": gen_id(), "created_at": now_iso()})
    await db.coupons.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/admin/coupons/{coupon_id}")
async def update_coupon(coupon_id: str, payload: CouponInput, admin: dict = Depends(require_admin)):
    data = payload.model_dump()
    data["code"] = data["code"].upper()
    res = await db.coupons.update_one({"id": coupon_id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Coupon not found")
    return await db.coupons.find_one({"id": coupon_id}, {"_id": 0})


@router.delete("/admin/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str, admin: dict = Depends(require_admin)):
    await db.coupons.delete_one({"id": coupon_id})
    return {"message": "Coupon deleted"}
