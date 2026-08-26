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


async def _category_name(cid: str) -> str:
    if not cid:
        return "selected"
    cat = await db.categories.find_one({"id": cid}, {"_id": 0, "name": 1})
    return cat["name"] if cat else "selected"


async def _cart_category_subtotal(user_id: str, location_id: str, category_id: str) -> float:
    """Server-derived subtotal of cart lines belonging to a category (products + combo items)."""
    cart = await db.carts.find_one({"user_id": user_id, "location_id": location_id})
    if not cart or not cart.get("items"):
        return 0.0
    total = 0.0
    for ci in cart["items"]:
        if ci.get("type") == "combo":
            pkg = await db.packages.find_one({"id": ci["combo_id"], "is_active": True}, {"_id": 0})
            if not pkg:
                continue
            from routers.packages import price_and_validate_combo
            try:
                priced = await price_and_validate_combo(pkg, ci.get("selections", {}), location_id, validate_stock=False)
            except Exception:
                continue
            for li in priced["items"]:
                if li.get("category_id") == category_id:
                    total += li["unit_price"] * li["quantity"]
        else:
            product = await db.products.find_one({"id": ci["product_id"]}, {"_id": 0})
            if product and product.get("is_active") and product.get("category_id") == category_id:
                total += product["selling_price"] * ci["quantity"]
    return round(total, 2)


async def _cart_breakdown(user_id: str, location_id: str):
    """Single cart read -> (total_subtotal, {category_id: subtotal}). Server-authoritative; never trusts client."""
    cart = await db.carts.find_one({"user_id": user_id, "location_id": location_id})
    total = 0.0
    by_cat: dict = {}
    if not cart or not cart.get("items"):
        return 0.0, by_cat
    for ci in cart["items"]:
        if ci.get("type") == "combo":
            pkg = await db.packages.find_one({"id": ci["combo_id"], "is_active": True}, {"_id": 0})
            if not pkg:
                continue
            from routers.packages import price_and_validate_combo
            try:
                priced = await price_and_validate_combo(pkg, ci.get("selections", {}), location_id, validate_stock=False)
            except Exception:
                continue
            total += priced["effective_price"]
            for li in priced["items"]:
                cid = li.get("category_id")
                by_cat[cid] = by_cat.get(cid, 0.0) + li["unit_price"] * li["quantity"]
        else:
            product = await db.products.find_one({"id": ci["product_id"]}, {"_id": 0})
            if product and product.get("is_active"):
                amt = product["selling_price"] * ci["quantity"]
                total += amt
                cid = product.get("category_id")
                by_cat[cid] = by_cat.get(cid, 0.0) + amt
    return round(total, 2), {k: round(v, 2) for k, v in by_cat.items()}


async def _cart_subtotal(user_id: str, location_id: str) -> float:
    total, _ = await _cart_breakdown(user_id, location_id)
    return total


async def _bulk_usage_counts(codes, user_id: str):
    """One pass over orders -> {CODE: (total_used, this_customer_used)} for the given coupon codes."""
    codes = [c.upper() for c in codes]
    res = {c: [0, 0] for c in codes}
    if not codes:
        return {}
    q = {"status": {"$ne": "cancelled"},
         "$or": [{"coupon_code": {"$in": codes}}, {"delivery_coupon_code": {"$in": codes}}]}
    async for o in db.orders.find(q, {"coupon_code": 1, "delivery_coupon_code": 1, "user_id": 1, "_id": 0}):
        seen = set()
        for field in ("coupon_code", "delivery_coupon_code"):
            code = (o.get(field) or "").upper()
            if code in res and code not in seen:
                seen.add(code)
                res[code][0] += 1
                if o.get("user_id") == user_id:
                    res[code][1] += 1
    return {k: (v[0], v[1]) for k, v in res.items()}


async def _is_first_time(user_id: str) -> bool:
    """First-time customer = no non-cancelled orders (server/DB-derived, never trusted from client)."""
    n = await db.orders.count_documents({"user_id": user_id, "status": {"$ne": "cancelled"}})
    return n == 0


async def _usage_counts(code: str, user_id: str):
    """(total redemptions, this-customer redemptions) for a public coupon, from order history."""
    code = code.upper()
    q = {"$or": [{"coupon_code": code}, {"delivery_coupon_code": code}], "status": {"$ne": "cancelled"}}
    total = await db.orders.count_documents(q)
    mine = await db.orders.count_documents({**q, "user_id": user_id})
    return total, mine


async def _assert_eligible(coupon: dict, user_id: str):
    """Server-authoritative customer eligibility (validity, target, first-order, usage limits). Raises 400."""
    now = datetime.now().isoformat()
    if coupon.get("start_date") and coupon["start_date"] > now:
        raise HTTPException(status_code=400, detail="Coupon not active yet")
    if coupon.get("end_date") and coupon["end_date"] < now:
        raise HTTPException(status_code=400, detail="Coupon expired")
    if coupon.get("target_user_ids") and user_id not in coupon["target_user_ids"]:
        raise HTTPException(status_code=400, detail="This coupon is not valid for your account")
    if coupon.get("first_order_only") and not await _is_first_time(user_id):
        raise HTTPException(status_code=400, detail="This coupon is only valid on your first order")
    ul, ulpc = coupon.get("usage_limit"), coupon.get("usage_limit_per_customer")
    if ul or ulpc:
        total, mine = await _usage_counts(coupon["code"], user_id)
        if ul and total >= ul:
            raise HTTPException(status_code=400, detail="This coupon has reached its usage limit")
        if ulpc and mine >= ulpc:
            raise HTTPException(status_code=400, detail="You have already used this coupon")


@router.post("/coupons/validate")
async def validate_coupon(payload: CouponValidateInput, user: dict = Depends(get_current_user)):
    coupon = await _find_coupon(payload.code)
    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid coupon code")
    if coupon.get("location_ids") and payload.location_id not in coupon["location_ids"]:
        raise HTTPException(status_code=400, detail="Coupon not valid for this location")
    await _assert_eligible(coupon, user["id"])

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

    # ---- Category-specific product coupon (server-derived category subtotal) ----
    if coupon.get("category_id"):
        cat_id = coupon["category_id"]
        cat_name = await _category_name(cat_id)
        cat_sub = await _cart_category_subtotal(user["id"], payload.location_id, cat_id)
        min_req = coupon.get("min_order_value", 0)
        if cat_sub <= 0:
            raise HTTPException(status_code=400, detail=f"Add {cat_name} items to use this coupon")
        if cat_sub < min_req:
            raise HTTPException(status_code=400,
                                detail=f"Add ₹{round(min_req - cat_sub)} more of {cat_name} items to use this coupon")
        discount = _calc_discount(coupon, cat_sub)
        return {"code": coupon["code"], "coupon_type": "product", "category_id": cat_id,
                "category_name": cat_name, "category_subtotal": cat_sub, "discount": discount,
                "message": f"Coupon applied on {cat_name} items"}
    cart_sub = await _cart_subtotal(user["id"], payload.location_id)
    if cart_sub < coupon.get("min_order_value", 0):
        raise HTTPException(status_code=400,
                            detail=f"Add ₹{round(coupon.get('min_order_value', 0) - cart_sub)} more to use this coupon")
    discount = _calc_discount(coupon, cart_sub)
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
                    ["code", "discount_type", "discount_value", "min_order_value", "max_discount", "end_date",
                     "category_id"]})
    return out


@router.get("/coupons/available")
async def available_coupons(location_id: str, subtotal: float = 0, pincode: str = "",
                            user: dict = Depends(get_current_user)):
    """VISIBLE coupons for THIS customer, each tagged with cart APPLICATION eligibility.
    Visibility (hidden entirely) vs application eligibility (shown but blocked) are separate concepts.
    Cart subtotals are derived server-side (the client `subtotal` param is ignored for correctness/security)."""
    now = datetime.now().isoformat()
    pincode = (pincode or "").strip()
    first_time = await _is_first_time(user["id"])
    cart_total, cart_by_cat = await _cart_breakdown(user["id"], location_id)
    coupons = await db.coupons.find({"is_active": True}, {"_id": 0}).to_list(500)
    limited_codes = [c["code"] for c in coupons if c.get("usage_limit") or c.get("usage_limit_per_customer")]
    usage = await _bulk_usage_counts(limited_codes, user["id"])
    out = []
    for c in coupons:
        # ---- VISIBILITY eligibility: hide entirely if any of these fail ----
        if c.get("start_date") and c["start_date"] > now:
            continue
        if c.get("end_date") and (c["end_date"] + "T23:59:59") < now:
            continue
        if c.get("location_ids") and location_id not in c["location_ids"]:
            continue
        if c.get("pin_codes") and (not pincode or pincode not in c["pin_codes"]):
            continue
        if c.get("target_user_ids") and user["id"] not in c["target_user_ids"]:
            continue
        if c.get("first_order_only") and not first_time:
            continue  # returning customers never see first-order coupons (no "not eligible" message)
        if c.get("usage_limit") or c.get("usage_limit_per_customer"):
            total, mine = usage.get(c["code"].upper(), (0, 0))
            if (c.get("usage_limit") and total >= c["usage_limit"]) or \
               (c.get("usage_limit_per_customer") and mine >= c["usage_limit_per_customer"]):
                continue

        # ---- APPLICATION / cart eligibility: shown, but may be blocked with a reason ----
        ctype = c.get("coupon_type", "product")
        eligible = True
        reason = ""
        shortfall = 0
        cat_id = c.get("category_id")
        cat_name = None
        if ctype == "product" and cat_id:
            cat_name = await _category_name(cat_id)
            cat_sub = cart_by_cat.get(cat_id, 0.0)
            min_req = c.get("min_order_value", 0)
            if cat_sub <= 0 or cat_sub < min_req:
                eligible = False
                shortfall = max(round(min_req - cat_sub), 0)
                reason = (f"Add ₹{shortfall} more of {cat_name} products to use"
                          if cat_sub > 0 else f"Add {cat_name} products worth ₹{round(min_req)} to use")
        elif ctype == "product" and cart_total < c.get("min_order_value", 0):
            eligible = False
            shortfall = round(c.get("min_order_value", 0) - cart_total)
            reason = f"Add ₹{shortfall} more to use"
        out.append({
            "code": c["code"], "coupon_type": ctype, "delivery_scope": c.get("delivery_scope", "both"),
            "discount_type": c["discount_type"], "discount_value": c["discount_value"],
            "min_order_value": c.get("min_order_value", 0), "max_discount": c.get("max_discount"),
            "category_id": cat_id, "category_name": cat_name,
            "first_order_only": bool(c.get("first_order_only")),
            "end_date": c.get("end_date"), "eligible": eligible, "reason": reason, "shortfall": shortfall,
            "state": "available" if eligible else ("almost" if shortfall > 0 else "condition"),
        })
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
