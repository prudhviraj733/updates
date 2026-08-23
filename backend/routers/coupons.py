from datetime import datetime
import random
import string

from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin, get_current_user
from models import CouponInput, CouponValidateInput, BulkCouponInput, gen_id, now_iso

router = APIRouter()


def _calc_discount(coupon: dict, subtotal: float) -> float:
    if coupon["discount_type"] == "percentage":
        disc = subtotal * coupon["discount_value"] / 100
    else:
        disc = coupon["discount_value"]
    if coupon.get("max_discount"):
        disc = min(disc, coupon["max_discount"])
    return round(min(disc, subtotal), 2)


def _calc_delivery_discount(coupon: dict, delivery_charge: float, express_charge: float) -> float:
    """Delivery coupons discount normal delivery, 30-minute (express), or both by delivery_scope."""
    scope = coupon.get("delivery_scope", "both")
    base = 0.0
    if scope in ("normal", "both"):
        base += delivery_charge
    if scope in ("express", "asap", "both"):
        base += express_charge
    if coupon["discount_type"] == "percentage":
        disc = base * coupon["discount_value"] / 100
    else:
        disc = coupon["discount_value"]
    if coupon.get("max_discount"):
        disc = min(disc, coupon["max_discount"])
    return round(min(disc, base), 2)


async def _find_coupon(code: str):
    return await db.coupons.find_one({"code": code.upper(), "is_active": True}, {"_id": 0})


@router.post("/coupons/validate")
async def validate_coupon(payload: CouponValidateInput):
    coupon = await _find_coupon(payload.code)
    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid coupon code")
    now = datetime.now().isoformat()
    if coupon.get("start_date") and coupon["start_date"] > now:
        raise HTTPException(status_code=400, detail="Coupon not active yet")
    if coupon.get("end_date") and coupon["end_date"] < now:
        raise HTTPException(status_code=400, detail="Coupon expired")
    if coupon.get("location_ids") and payload.location_id not in coupon["location_ids"]:
        raise HTTPException(status_code=400, detail="Coupon not valid for this location")

    ctype = coupon.get("coupon_type", "product")

    # ---- Stacking rule: max 1 product coupon + 1 delivery coupon ----
    applied_types = []
    for ac in payload.applied_codes:
        if ac.upper() == payload.code.upper():
            continue
        other = await _find_coupon(ac)
        if other:
            applied_types.append(other.get("coupon_type", "product"))
        else:
            applied_types.append("product")  # personalized coupons are product-type
    if ctype in applied_types:
        label = "delivery" if ctype == "delivery" else "product/order"
        raise HTTPException(status_code=400, detail=f"You can only apply one {label} coupon per order")

    if ctype == "delivery":
        if payload.delivery_charge <= 0 and payload.express_charge <= 0:
            raise HTTPException(status_code=400, detail="No delivery charge to discount")
        discount = _calc_delivery_discount(coupon, payload.delivery_charge, payload.express_charge)
        return {"code": coupon["code"], "coupon_type": "delivery", "delivery_scope": coupon.get("delivery_scope", "both"),
                "discount": discount, "message": "Delivery coupon applied"}

    if payload.subtotal < coupon.get("min_order_value", 0):
        raise HTTPException(status_code=400, detail=f"Minimum order value ₹{coupon['min_order_value']} required")
    discount = _calc_discount(coupon, payload.subtotal)
    return {"code": coupon["code"], "coupon_type": "product", "discount": discount, "message": "Coupon applied"}


@router.get("/coupons")
async def list_public_coupons(location_id: str = None):
    now = datetime.now().isoformat()
    coupons = await db.coupons.find({"is_active": True}, {"_id": 0}).to_list(200)
    out = []
    for c in coupons:
        if c.get("start_date") and c["start_date"] > now:
            continue
        if c.get("end_date") and (c["end_date"] + "T23:59:59") < now:
            continue
        if location_id and c.get("location_ids") and location_id not in c["location_ids"]:
            continue
        out.append({k: c.get(k) for k in
                    ["code", "discount_type", "discount_value", "min_order_value", "max_discount", "end_date"]})
    return out


@router.get("/coupons/available")
async def available_coupons(location_id: str, subtotal: float = 0, pincode: str = "",
                            user: dict = Depends(get_current_user)):
    """Coupons actually eligible for THIS customer, PIN, cart & date (product + delivery)."""
    now = datetime.now().isoformat()
    pincode = (pincode or "").strip()
    coupons = await db.coupons.find({"is_active": True}, {"_id": 0}).to_list(500)
    out = []
    for c in coupons:
        if c.get("start_date") and c["start_date"] > now:
            continue
        if c.get("end_date") and (c["end_date"] + "T23:59:59") < now:
            continue
        if c.get("location_ids") and location_id not in c["location_ids"]:
            continue
        if c.get("pin_codes"):
            if not pincode or pincode not in c["pin_codes"]:
                continue
        if c.get("target_user_ids") and user["id"] not in c["target_user_ids"]:
            continue
        ctype = c.get("coupon_type", "product")
        eligible = True
        reason = ""
        if ctype == "product" and subtotal < c.get("min_order_value", 0):
            eligible = False
            reason = f"Add ₹{round(c.get('min_order_value', 0) - subtotal)} more to use"
        out.append({
            "code": c["code"], "coupon_type": ctype, "delivery_scope": c.get("delivery_scope", "both"),
            "discount_type": c["discount_type"], "discount_value": c["discount_value"],
            "min_order_value": c.get("min_order_value", 0), "max_discount": c.get("max_discount"),
            "end_date": c.get("end_date"), "eligible": eligible, "reason": reason,
        })
    # eligible first
    out.sort(key=lambda x: (not x["eligible"], x["coupon_type"]))
    return out


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


def _rand_code(prefix: str) -> str:
    return prefix.upper() + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


@router.post("/admin/coupons/bulk")
async def bulk_create_coupons(payload: BulkCouponInput, admin: dict = Depends(require_admin)):
    count = max(1, min(payload.count, 5000))
    base = payload.model_dump()
    base.pop("prefix", None)
    base.pop("count", None)
    created = []
    for _ in range(count):
        code = _rand_code(payload.prefix)
        while await db.coupons.find_one({"code": code}):
            code = _rand_code(payload.prefix)
        doc = {**base, "code": code, "is_active": True, "id": gen_id(), "created_at": now_iso()}
        await db.coupons.insert_one(doc)
        created.append(code)
    return {"created": len(created), "codes": created}
