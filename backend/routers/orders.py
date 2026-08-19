from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import get_current_user, require_admin
from models import OrderInput, OrderStatusUpdate, OrderTrackingInput, gen_id, now_iso
from routers.delivery import get_settings, compute_slots
from routers.coupons import _calc_discount, _calc_delivery_discount
from routers.notifications import notify_order
from routers.packages import price_and_validate_combo

router = APIRouter()

ORDER_STATUSES = ["pending", "accepted", "confirmed", "preparing", "ready_for_delivery",
                  "out_for_delivery", "delivered", "cancelled"]

CUSTOMER_STATUS_MAP = {
    "pending": "Order Placed",
    "accepted": "Order Confirmed",
    "confirmed": "Order Confirmed",
    "preparing": "Being Prepared",
    "ready_for_delivery": "Packed & Ready",
    "out_for_delivery": "Out for Delivery",
    "delivered": "Delivered",
    "cancelled": "Cancelled",
}


def customer_status(status: str) -> str:
    return CUSTOMER_STATUS_MAP.get(status, status)


async def _grant_rewards(order: dict):
    """Grant wallet cashback + milestone rewards when an order is delivered (idempotent)."""
    from routers.settings import load_settings
    from routers.wallet import add_wallet_entry
    s = await load_settings()
    uid = order["user_id"]
    delivered_count = await db.orders.count_documents({"user_id": uid, "status": "delivered"})
    if s.get("cashback_enabled") and not await db.wallet_ledger.find_one({"order_id": order["id"], "source": "cashback"}):
        # loyalty-tier cashback rate (falls back to flat cashback_percent)
        percent = s.get("cashback_percent", 0)
        tier_name = None
        if s.get("loyalty_enabled"):
            from routers.settings import loyalty_tier_for
            tier, _ = loyalty_tier_for(delivered_count, s)
            if tier:
                percent = tier.get("cashback_percent", percent)
                tier_name = tier.get("name")
        cb = round(order.get("final_amount", 0) * percent / 100, 2)
        if s.get("cashback_max"):
            cb = min(cb, s["cashback_max"])
        if cb > 0:
            note = f"Cashback for order {order.get('order_number')}" + (f" ({tier_name} tier {percent}%)" if tier_name else "")
            await add_wallet_entry(uid, cb, "Order cashback", order_id=order["id"], source="cashback", notes=note)
    if s.get("milestone_enabled"):
        delivered_count = await db.orders.count_documents({"user_id": uid, "status": "delivered"})
        rewards = s.get("milestone_rewards", {}) or {}
        key = str(delivered_count)
        note = f"Milestone #{key} reward"
        if key in rewards and not await db.wallet_ledger.find_one({"user_id": uid, "source": "milestone", "notes": note}):
            amt = rewards[key]
            if amt and amt > 0:
                await add_wallet_entry(uid, amt, "Milestone reward", source="milestone", notes=note)


async def gen_order_number() -> str:
    count = await db.orders.count_documents({})
    return f"FG{datetime.now().strftime('%y%m')}{count + 1:05d}"


async def _inv_filter(product_id, pincode, location_id):
    if pincode and await db.inventory.count_documents({"product_id": product_id, "pincode": pincode}):
        return {"product_id": product_id, "pincode": pincode}
    return {"product_id": product_id, "location_id": location_id}


async def _reserve_inventory(items, location_id, pincode=None):
    reserved = []
    for it in items:
        base = await _inv_filter(it["product_id"], pincode, location_id)
        res = await db.inventory.find_one_and_update(
            {**base, "available_quantity": {"$gte": it["quantity"]}},
            {"$inc": {"available_quantity": -it["quantity"], "reserved_quantity": it["quantity"]}},
        )
        if not res:
            for r in reserved:
                rb = await _inv_filter(r["product_id"], pincode, location_id)
                await db.inventory.update_one(
                    rb, {"$inc": {"available_quantity": r["quantity"], "reserved_quantity": -r["quantity"]}})
            raise HTTPException(status_code=409, detail=f"{it['name']} is out of stock")
        reserved.append(it)


@router.post("/orders")
async def create_order(payload: OrderInput, user: dict = Depends(get_current_user)):
    cart = await db.carts.find_one({"user_id": user["id"], "location_id": payload.location_id})
    if not cart or not cart.get("items"):
        raise HTTPException(status_code=400, detail="Cart is empty")

    location = await db.locations.find_one({"id": payload.location_id, "is_active": True}, {"_id": 0})
    if not location:
        raise HTTPException(status_code=400, detail="Invalid location")

    address = await db.addresses.find_one({"id": payload.address_id, "user_id": user["id"]}, {"_id": 0})
    if not address:
        raise HTTPException(status_code=400, detail="Invalid delivery address")

    # PIN-code serviceability + PIN-specific delivery rules
    pin = await db.pincodes.find_one({"pincode": (address.get("pincode") or "").strip()}, {"_id": 0})
    if not pin or not pin.get("is_serviceable"):
        raise HTTPException(status_code=400, detail="Sorry, we don't deliver to this PIN code yet.")
    pin_delivery = pin["delivery_charge"] if pin.get("delivery_charge") is not None else location.get("delivery_charge", 0)
    pin_min = pin.get("min_order_value") or location.get("min_order_value", 0)
    pin_free_threshold = pin.get("free_delivery_threshold")

    settings = await get_settings(payload.location_id)

    # Build order items snapshot (individual products + combo bundles)
    items = []
    combos = []
    products_subtotal = 0.0
    combos_chosen_value = 0.0
    combos_effective = 0.0
    combo_savings_total = 0.0
    total_mrp = 0.0
    for ci in cart["items"]:
        if ci.get("type") == "combo":
            pkg = await db.packages.find_one({"id": ci["combo_id"], "is_active": True}, {"_id": 0})
            if not pkg:
                raise HTTPException(status_code=400, detail="A combo in your cart is no longer available")
            priced = await price_and_validate_combo(pkg, ci.get("selections", {}), payload.location_id, validate_stock=True)
            for li in priced["items"]:
                line = li["unit_price"] * li["quantity"]
                total_mrp += li["mrp"] * li["quantity"]
                items.append({
                    "product_id": li["product_id"], "name": li["name"], "image": li["image"],
                    "pack_size": li["pack_size"], "unit_price": li["unit_price"], "mrp": li["mrp"],
                    "cost_price": li["cost_price"], "category_id": li["category_id"],
                    "subcategory_id": li["subcategory_id"], "brand_id": li["brand_id"],
                    "quantity": li["quantity"], "line_total": round(line, 2),
                    "combo_id": pkg["id"], "combo_name": pkg["name"],
                })
            combos_chosen_value += priced["chosen_value"]
            combos_effective += priced["effective_price"]
            combo_savings_total += priced["savings"]
            combos.append({
                "combo_id": pkg["id"], "name": pkg["name"], "image": priced["image"],
                "base_price": priced["base_price"], "chosen_value": priced["chosen_value"],
                "savings": priced["savings"], "effective_price": priced["effective_price"],
                "items": [{"product_id": li["product_id"], "name": li["name"],
                           "quantity": li["quantity"], "unit_price": li["unit_price"]} for li in priced["items"]],
            })
            continue
        product = await db.products.find_one({"id": ci["product_id"]}, {"_id": 0})
        if not product or not product.get("is_active"):
            raise HTTPException(status_code=400, detail="A product in your cart is unavailable")
        line = product["selling_price"] * ci["quantity"]
        products_subtotal += line
        total_mrp += product.get("mrp", product["selling_price"]) * ci["quantity"]
        items.append({
            "product_id": product["id"], "name": product["name"],
            "image": product["images"][0] if product.get("images") else "",
            "pack_size": product.get("pack_size", ""),
            "unit_price": product["selling_price"], "mrp": product.get("mrp", product["selling_price"]),
            "cost_price": product.get("cost_price", 0),
            "category_id": product.get("category_id"),
            "subcategory_id": product.get("subcategory_id"),
            "brand_id": product.get("brand_id"),
            "quantity": ci["quantity"], "line_total": round(line, 2),
        })

    subtotal = round(products_subtotal + combos_effective, 2)
    product_discount = round(total_mrp - (products_subtotal + combos_chosen_value), 2)
    combo_discount = round(combo_savings_total, 2)

    if subtotal < pin_min:
        raise HTTPException(status_code=400, detail=f"Minimum order value is ₹{pin_min}")

    # Delivery type / slot
    slot_id = None
    slot_label = None
    delivery_charge = pin_delivery
    pin_free_applied = bool(pin_free_threshold) and subtotal >= pin_free_threshold
    if pin_free_applied:
        delivery_charge = 0
    asap_charge = 0.0
    if payload.delivery_type == "asap":
        if not pin.get("asap_enabled", True):
            raise HTTPException(status_code=400, detail="ASAP delivery is not available for this PIN code")
        if not settings.get("asap_enabled"):
            raise HTTPException(status_code=400, detail="ASAP delivery not available for this location")
        asap_charge = settings.get("asap_charge", 100)
    else:
        if not payload.slot_id:
            raise HTTPException(status_code=400, detail="Please select a delivery slot")
        date_part = payload.slot_id.split("_")[0]
        slot_data = await compute_slots(payload.location_id, date_part)
        match = next((s for s in slot_data["slots"] if s["id"] == payload.slot_id), None)
        if not match or not match["available"]:
            raise HTTPException(status_code=409, detail="Selected slot is no longer available")
        slot_id = payload.slot_id
        slot_label = match["label"]

    # Coupon (public or personalized)
    coupon_discount = 0.0
    coupon_code = None
    campaign_id = None
    free_delivery_applied = False
    if payload.coupon_code:
        coupon = await db.coupons.find_one({"code": payload.coupon_code.upper(), "is_active": True}, {"_id": 0})
        if coupon and subtotal >= coupon.get("min_order_value", 0):
            coupon_discount = _calc_discount(coupon, subtotal)
            coupon_code = coupon["code"]
        else:
            from routers.personalization import resolve_personalized
            try:
                pc = await resolve_personalized(payload.coupon_code, user["id"], payload.location_id, subtotal)
            except HTTPException:
                pc = None
            if pc:
                coupon_discount = pc["discount"]
                coupon_code = pc["code"]
                campaign_id = pc.get("campaign_id")
                free_delivery_applied = pc.get("free_delivery", False)

    if free_delivery_applied or pin_free_applied:
        delivery_charge = 0
        free_delivery_applied = True

    # Delivery-type coupon (stacks with 1 product coupon; discounts normal/asap/both)
    delivery_discount = 0.0
    delivery_coupon_code = None
    if payload.delivery_coupon_code:
        dcoupon = await db.coupons.find_one(
            {"code": payload.delivery_coupon_code.upper(), "is_active": True, "coupon_type": "delivery"}, {"_id": 0})
        if dcoupon:
            if dcoupon.get("location_ids") and payload.location_id not in dcoupon["location_ids"]:
                raise HTTPException(status_code=400, detail="Delivery coupon not valid for this location")
            delivery_discount = _calc_delivery_discount(dcoupon, delivery_charge, asap_charge)
            delivery_coupon_code = dcoupon["code"]

    final_amount = round(subtotal - coupon_discount + delivery_charge + asap_charge - delivery_discount, 2)
    final_amount = max(0.0, final_amount)

    # Redeem wallet balance (partial or full)
    wallet_used = 0.0
    if payload.use_wallet:
        from routers.wallet import wallet_balance
        bal = await wallet_balance(user["id"])
        wallet_used = round(min(bal, final_amount), 2)
        final_amount = round(final_amount - wallet_used, 2)

    # Reserve inventory atomically (per-PIN when configured)
    await _reserve_inventory(items, payload.location_id, pin.get("pincode"))

    payment_status = "pending"
    order = {
        "id": gen_id(),
        "order_number": await gen_order_number(),
        "user_id": user["id"],
        "customer_name": user["name"],
        "customer_phone": user.get("phone", ""),
        "location_id": payload.location_id,
        "location_name": location["name"],
        "pincode": pin.get("pincode"),
        "address": address,
        "items": items,
        "subtotal": round(subtotal, 2),
        "product_discount": product_discount,
        "combo_discount": combo_discount,
        "combos": combos,
        "coupon_code": coupon_code,
        "coupon_discount": coupon_discount,
        "delivery_coupon_code": delivery_coupon_code,
        "delivery_discount": delivery_discount,
        "wallet_used": wallet_used,
        "campaign_id": campaign_id,
        "free_delivery_applied": free_delivery_applied,
        "delivery_charge": delivery_charge,
        "asap_charge": asap_charge,
        "final_amount": final_amount,
        "delivery_type": payload.delivery_type,
        "slot_id": slot_id,
        "slot_label": slot_label,
        "is_priority": payload.delivery_type == "asap",
        "accepted": False,
        "accepted_at": None,
        "tracking_url": None,
        "tracking_provider": None,
        "payment_method": payload.payment_method,
        "payment_status": payment_status,
        "status": "pending",
        "status_history": [{"status": "pending", "at": now_iso()}],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.orders.insert_one(order)
    if wallet_used > 0:
        from routers.wallet import add_wallet_entry
        await add_wallet_entry(user["id"], -wallet_used, "order_payment",
                               order_id=order["id"], notes=f"Paid for order {order['order_number']}")
    if campaign_id and coupon_code:
        await db.personalized_coupons.update_one(
            {"code": coupon_code, "user_id": user["id"]},
            {"$inc": {"used_count": 1}, "$set": {"redeemed_at": now_iso()}})
    await db.carts.update_one({"user_id": user["id"], "location_id": payload.location_id}, {"$set": {"items": []}})
    order.pop("_id", None)
    order["customer_status"] = customer_status(order["status"])
    try:
        await notify_order(order, "pending")
    except Exception:
        pass
    return order


@router.get("/orders")
async def list_my_orders(user: dict = Depends(get_current_user)):
    docs = await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for d in docs:
        d["customer_status"] = customer_status(d.get("status"))
    return docs


@router.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["user_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    order["customer_status"] = customer_status(order.get("status"))
    return order


# ---- Admin ----
@router.get("/admin/orders")
async def admin_list_orders(status: str = None, location_id: str = None, admin: dict = Depends(require_admin)):
    query = {}
    if status:
        query["status"] = status
    if location_id:
        query["location_id"] = location_id
    docs = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for d in docs:
        d["customer_status"] = customer_status(d.get("status"))
    return docs


@router.get("/admin/orders/pending-count")
async def admin_pending_count(admin: dict = Depends(require_admin)):
    """New (unaccepted) orders for the high-priority admin alert."""
    new_orders = await db.orders.find(
        {"status": "pending", "accepted": {"$ne": True}}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {
        "count": len(new_orders),
        "order_ids": [o["id"] for o in new_orders],
        "latest": new_orders[0] if new_orders else None,
    }


@router.put("/admin/orders/{order_id}/accept")
async def accept_order(order_id: str, admin: dict = Depends(require_admin)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("accepted"):
        return await db.orders.find_one({"id": order_id}, {"_id": 0})
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"accepted": True, "accepted_at": now_iso(), "status": "accepted", "updated_at": now_iso()},
         "$push": {"status_history": {"status": "accepted", "at": now_iso()}}})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    try:
        await notify_order(updated, "accepted")
    except Exception:
        pass
    return updated


@router.put("/admin/orders/{order_id}/tracking")
async def set_tracking(order_id: str, payload: OrderTrackingInput, admin: dict = Depends(require_admin)):
    res = await db.orders.update_one(
        {"id": order_id},
        {"$set": {"tracking_url": payload.tracking_url, "tracking_provider": payload.tracking_provider,
                  "updated_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


async def _apply_inventory_transition(order, new_status):
    loc = order["location_id"]
    pincode = order.get("pincode")

    async def filt(pid):
        if pincode and await db.inventory.count_documents({"product_id": pid, "pincode": pincode}):
            return {"product_id": pid, "pincode": pincode}
        return {"product_id": pid, "location_id": loc}

    if new_status == "cancelled" and order["status"] != "cancelled":
        for it in order["items"]:
            await db.inventory.update_one(
                await filt(it["product_id"]),
                {"$inc": {"available_quantity": it["quantity"], "reserved_quantity": -it["quantity"]}})
    elif new_status == "delivered" and order["status"] != "delivered":
        for it in order["items"]:
            await db.inventory.update_one(
                await filt(it["product_id"]),
                {"$inc": {"reserved_quantity": -it["quantity"], "sold_quantity": it["quantity"]}})


@router.put("/admin/orders/{order_id}/status")
async def update_order_status(order_id: str, payload: OrderStatusUpdate, admin: dict = Depends(require_admin)):
    if payload.status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await _apply_inventory_transition(order, payload.status)
    update = {"status": payload.status, "updated_at": now_iso()}
    if payload.status == "delivered" and order.get("payment_method") == "cod":
        update["payment_status"] = "paid"
    # Refund to wallet when cancelling a paid (online) order
    if (payload.status == "cancelled" and order["status"] != "cancelled"
            and order.get("payment_status") == "paid"):
        from routers.wallet import add_wallet_entry
        already = await db.wallet_ledger.find_one({"order_id": order_id, "reason": "refund"})
        if not already:
            await add_wallet_entry(order["user_id"], order.get("final_amount", 0), "refund",
                                   order_id=order_id, notes=f"Refund for cancelled order {order.get('order_number')}")
            update["payment_status"] = "refunded"
    await db.orders.update_one(
        {"id": order_id},
        {"$set": update, "$push": {"status_history": {"status": payload.status, "at": now_iso()}}})
    if payload.status == "delivered" and order["status"] != "delivered":
        await _grant_rewards(await db.orders.find_one({"id": order_id}, {"_id": 0}))
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    try:
        await notify_order(updated, payload.status)
    except Exception:
        pass
    return updated
