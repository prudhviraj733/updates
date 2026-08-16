from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import get_current_user, require_admin
from models import OrderInput, OrderStatusUpdate, gen_id, now_iso
from routers.delivery import get_settings, compute_slots
from routers.coupons import _calc_discount

router = APIRouter()

ORDER_STATUSES = ["pending", "confirmed", "preparing", "ready_for_delivery",
                  "out_for_delivery", "delivered", "cancelled"]


async def gen_order_number() -> str:
    count = await db.orders.count_documents({})
    return f"FG{datetime.now().strftime('%y%m')}{count + 1:05d}"


async def _reserve_inventory(items, location_id):
    reserved = []
    for it in items:
        res = await db.inventory.find_one_and_update(
            {"product_id": it["product_id"], "location_id": location_id,
             "available_quantity": {"$gte": it["quantity"]}},
            {"$inc": {"available_quantity": -it["quantity"], "reserved_quantity": it["quantity"]}},
        )
        if not res:
            for r in reserved:
                await db.inventory.update_one(
                    {"product_id": r["product_id"], "location_id": location_id},
                    {"$inc": {"available_quantity": r["quantity"], "reserved_quantity": -r["quantity"]}},
                )
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

    settings = await get_settings(payload.location_id)

    # Build order items snapshot
    items = []
    subtotal = 0.0
    total_mrp = 0.0
    for ci in cart["items"]:
        product = await db.products.find_one({"id": ci["product_id"]}, {"_id": 0})
        if not product or not product.get("is_active"):
            raise HTTPException(status_code=400, detail="A product in your cart is unavailable")
        line = product["selling_price"] * ci["quantity"]
        subtotal += line
        total_mrp += product.get("mrp", product["selling_price"]) * ci["quantity"]
        items.append({
            "product_id": product["id"], "name": product["name"],
            "image": product["images"][0] if product.get("images") else "",
            "pack_size": product.get("pack_size", ""),
            "unit_price": product["selling_price"], "mrp": product.get("mrp", product["selling_price"]),
            "quantity": ci["quantity"], "line_total": round(line, 2),
        })

    if subtotal < location.get("min_order_value", 0):
        raise HTTPException(status_code=400, detail=f"Minimum order value is ₹{location['min_order_value']}")

    # Delivery type / slot
    slot_id = None
    slot_label = None
    delivery_charge = location.get("delivery_charge", 0)
    asap_charge = 0.0
    if payload.delivery_type == "asap":
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

    # Coupon
    coupon_discount = 0.0
    coupon_code = None
    if payload.coupon_code:
        coupon = await db.coupons.find_one({"code": payload.coupon_code.upper(), "is_active": True}, {"_id": 0})
        if coupon and subtotal >= coupon.get("min_order_value", 0):
            coupon_discount = _calc_discount(coupon, subtotal)
            coupon_code = coupon["code"]

    final_amount = round(subtotal - coupon_discount + delivery_charge + asap_charge, 2)

    # Reserve inventory atomically
    await _reserve_inventory(items, payload.location_id)

    payment_status = "pending"
    order = {
        "id": gen_id(),
        "order_number": await gen_order_number(),
        "user_id": user["id"],
        "customer_name": user["name"],
        "customer_phone": user.get("phone", ""),
        "location_id": payload.location_id,
        "location_name": location["name"],
        "address": address,
        "items": items,
        "subtotal": round(subtotal, 2),
        "product_discount": round(total_mrp - subtotal, 2),
        "coupon_code": coupon_code,
        "coupon_discount": coupon_discount,
        "delivery_charge": delivery_charge,
        "asap_charge": asap_charge,
        "final_amount": final_amount,
        "delivery_type": payload.delivery_type,
        "slot_id": slot_id,
        "slot_label": slot_label,
        "is_priority": payload.delivery_type == "asap",
        "payment_method": payload.payment_method,
        "payment_status": payment_status,
        "status": "pending",
        "status_history": [{"status": "pending", "at": now_iso()}],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.orders.insert_one(order)
    await db.carts.update_one({"user_id": user["id"], "location_id": payload.location_id}, {"$set": {"items": []}})
    order.pop("_id", None)
    return order


@router.get("/orders")
async def list_my_orders(user: dict = Depends(get_current_user)):
    docs = await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@router.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["user_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    return order


# ---- Admin ----
@router.get("/admin/orders")
async def admin_list_orders(status: str = None, location_id: str = None, admin: dict = Depends(require_admin)):
    query = {}
    if status:
        query["status"] = status
    if location_id:
        query["location_id"] = location_id
    return await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)


async def _apply_inventory_transition(order, new_status):
    loc = order["location_id"]
    if new_status == "cancelled" and order["status"] != "cancelled":
        for it in order["items"]:
            await db.inventory.update_one(
                {"product_id": it["product_id"], "location_id": loc},
                {"$inc": {"available_quantity": it["quantity"], "reserved_quantity": -it["quantity"]}})
    elif new_status == "delivered" and order["status"] != "delivered":
        for it in order["items"]:
            await db.inventory.update_one(
                {"product_id": it["product_id"], "location_id": loc},
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
    await db.orders.update_one(
        {"id": order_id},
        {"$set": update, "$push": {"status_history": {"status": payload.status, "at": now_iso()}}})
    return await db.orders.find_one({"id": order_id}, {"_id": 0})
