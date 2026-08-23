"""Customer refund / replacement requests.

Business rule: refunds/replacements are ONLY for business/product/packing/delivery
faults. Change-of-mind reasons are never offered (see DEFAULT_REASONS).
"""
import os

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import get_current_user, require_admin
from models import (ReturnCreateInput, ReturnStatusUpdateInput, ReturnReasonInput,
                    gen_id, now_iso)

router = APIRouter()

# Only business-fault reasons. NO change-of-mind reasons are ever seeded/allowed.
DEFAULT_REASONS = [
    "Wrong product delivered",
    "Wrong product/variant delivered",
    "Damaged product",
    "Damaged packaging",
    "Product leaked/spilled",
    "Product expired",
    "Product quality issue",
    "Product received in poor condition",
    "Incorrect quantity delivered",
    "Missing/incorrect item",
    "Product does not match the displayed product",
    "Other",
]

RETURN_STATUSES = [
    "requested", "under_review", "rejected",
    "refund_approved", "refund_processing", "refunded",
    "replacement_approved", "replacement_scheduled", "replacement_out_for_delivery", "replaced",
]
TERMINAL = {"rejected", "refunded", "replaced"}
REFUND_FLOW = {"refund_approved", "refund_processing", "refunded"}
REPLACEMENT_FLOW = {"replacement_approved", "replacement_scheduled", "replacement_out_for_delivery", "replaced"}

CUSTOMER_LABELS = {
    "requested": "Requested",
    "under_review": "Under Review",
    "rejected": "Rejected",
    "refund_approved": "Refund Approved",
    "refund_processing": "Refund Processing",
    "refunded": "Refunded",
    "replacement_approved": "Replacement Approved",
    "replacement_scheduled": "Replacement Preparing",
    "replacement_out_for_delivery": "Replacement Out for Delivery",
    "replaced": "Replacement Delivered",
}


async def ensure_reasons():
    """Seed the business-fault reasons once."""
    if await db.return_reasons.count_documents({}) == 0:
        for label in DEFAULT_REASONS:
            await db.return_reasons.insert_one({
                "id": gen_id(), "label": label, "is_active": True,
                "requires_photo": True, "is_other": label == "Other",
                "created_at": now_iso(),
            })


def _with_labels(r: dict) -> dict:
    r["customer_status_label"] = CUSTOMER_LABELS.get(r.get("status"), r.get("status"))
    return r


async def _inv_key(pid: str, pincode: str, location_id: str):
    if pincode and await db.inventory.count_documents({"product_id": pid, "pincode": pincode}):
        return {"product_id": pid, "pincode": pincode}
    return {"product_id": pid, "location_id": location_id}


# ==================== Reasons (public + admin) ====================
@router.get("/returns/reasons")
async def customer_reasons(user: dict = Depends(get_current_user)):
    await ensure_reasons()
    rows = await db.return_reasons.find({"is_active": True}, {"_id": 0}).to_list(200)
    return rows


@router.get("/admin/return-reasons")
async def admin_reasons(admin: dict = Depends(require_admin)):
    await ensure_reasons()
    return await db.return_reasons.find({}, {"_id": 0}).to_list(200)


@router.post("/admin/return-reasons")
async def add_reason(payload: ReturnReasonInput, admin: dict = Depends(require_admin)):
    doc = {"id": gen_id(), "label": payload.label.strip(), "is_active": payload.is_active,
           "requires_photo": payload.requires_photo, "is_other": False, "created_at": now_iso()}
    await db.return_reasons.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/admin/return-reasons/{reason_id}")
async def edit_reason(reason_id: str, payload: ReturnReasonInput, admin: dict = Depends(require_admin)):
    r = await db.return_reasons.find_one({"id": reason_id})
    if not r:
        raise HTTPException(status_code=404, detail="Reason not found")
    await db.return_reasons.update_one(
        {"id": reason_id},
        {"$set": {"label": payload.label.strip(), "is_active": payload.is_active,
                  "requires_photo": payload.requires_photo, "updated_at": now_iso()}})
    return await db.return_reasons.find_one({"id": reason_id}, {"_id": 0})


# ==================== Customer ====================
@router.get("/me/returns")
async def my_returns(order_id: str = None, user: dict = Depends(get_current_user)):
    query = {"user_id": user["id"]}
    if order_id:
        query["order_id"] = order_id
    rows = await db.returns.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_with_labels(r) for r in rows]


@router.get("/me/returns/{request_id}")
async def my_return_detail(request_id: str, user: dict = Depends(get_current_user)):
    r = await db.returns.find_one({"id": request_id, "user_id": user["id"]}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    return _with_labels(r)


@router.post("/me/returns")
async def create_return(payload: ReturnCreateInput, user: dict = Depends(get_current_user)):
    if payload.type not in ("refund", "replacement"):
        raise HTTPException(status_code=400, detail="Choose refund or replacement")

    order = await db.orders.find_one({"id": payload.order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    # Only the customer who placed the order
    if order["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    # Only delivered orders/items are eligible
    if order.get("status") != "delivered":
        raise HTTPException(status_code=400, detail="Only delivered orders are eligible for refund/replacement")

    item = next((it for it in order.get("items", []) if it.get("product_id") == payload.product_id), None)
    if not item:
        raise HTTPException(status_code=400, detail="This item is not part of the order")
    delivered_qty = item.get("quantity", 1)
    qty = max(1, min(int(payload.quantity or 1), delivered_qty))

    # Validate reason
    await ensure_reasons()
    reason = await db.return_reasons.find_one({"id": payload.reason_id, "is_active": True}, {"_id": 0})
    if not reason:
        raise HTTPException(status_code=400, detail="Select a valid reason")
    # "Other" needs a written explanation
    if reason.get("is_other") and not (payload.description or "").strip():
        raise HTTPException(status_code=400, detail="Please explain the issue")
    # Photo evidence is mandatory for business/product/delivery issues
    if reason.get("requires_photo", True) and not (payload.photos or []):
        raise HTTPException(status_code=400, detail="Photo evidence is required to process this request")

    # Fraud/duplicate guard: no second active request for the same order+item
    active = await db.returns.find_one({
        "order_id": payload.order_id, "product_id": payload.product_id,
        "user_id": user["id"],
        "status": {"$nin": list(TERMINAL)},
    })
    if active:
        raise HTTPException(status_code=400, detail="An active request already exists for this item")

    unit_price = item.get("unit_price", 0)
    line_amount = round(unit_price * qty, 2)
    now = now_iso()
    doc = {
        "id": gen_id(),
        "request_number": "RR" + gen_id().replace("-", "")[:10].upper(),
        "order_id": order["id"],
        "order_number": order.get("order_number"),
        "user_id": user["id"],
        "customer_name": order.get("customer_name"),
        "customer_phone": order.get("customer_phone"),
        "product_id": item.get("product_id"),
        "product_name": item.get("name"),
        "pack_size": item.get("pack_size"),
        "image": item.get("image"),
        "quantity": qty,
        "unit_price": unit_price,
        "line_amount": line_amount,
        "type": payload.type,
        "reason_id": reason["id"],
        "reason_label": reason["label"],
        "description": (payload.description or "").strip(),
        "photos": payload.photos or [],
        "pincode": order.get("pincode"),
        "location_id": order.get("location_id"),
        "address": order.get("address"),
        "order_value": order.get("final_amount", 0),
        "status": "requested",
        "status_history": [{"status": "requested", "at": now, "note": ""}],
        "admin_notes": [],
        "refund": None,
        "replacement": {"inventory_reserved": False} if payload.type == "replacement" else None,
        "created_at": now,
        "updated_at": now,
    }
    await db.returns.insert_one(doc)
    doc.pop("_id", None)

    # Notify admin (best effort)
    try:
        from routers.notifications import send_email, EMAIL_FROM_NAME
        admin_email = os.environ.get("ADMIN_EMAIL")
        if admin_email:
            html = (f'<div style="font-family:Arial,sans-serif;color:#111">'
                    f'<h2 style="color:#1B4332">New {payload.type} request {doc["request_number"]}</h2>'
                    f'<p>Order {doc["order_number"]} · {doc["product_name"]} × {qty}</p>'
                    f'<p>Reason: {reason["label"]}</p>'
                    f'<p>Customer: {doc["customer_name"]} · PIN {doc["pincode"]}</p></div>')
            await send_email(to=admin_email, subject=f"{EMAIL_FROM_NAME}: New {payload.type} request", html=html)
    except Exception:
        pass

    return _with_labels(doc)


# ==================== Admin ====================
@router.get("/admin/returns")
async def admin_list_returns(status: str = None, admin: dict = Depends(require_admin)):
    query = {}
    if status == "active":
        query["status"] = {"$nin": list(TERMINAL)}
    elif status:
        query["status"] = status
    rows = await db.returns.find(query, {"_id": 0}).sort("created_at", -1).to_list(3000)
    return [_with_labels(r) for r in rows]


@router.get("/admin/returns/{request_id}")
async def admin_return_detail(request_id: str, admin: dict = Depends(require_admin)):
    r = await db.returns.find_one({"id": request_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    return _with_labels(r)


@router.put("/admin/returns/{request_id}/status")
async def update_return_status(request_id: str, payload: ReturnStatusUpdateInput,
                               admin: dict = Depends(require_admin)):
    if payload.status not in RETURN_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    r = await db.returns.find_one({"id": request_id})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    cur = r["status"]
    new = payload.status
    if cur in TERMINAL:
        raise HTTPException(status_code=400, detail=f"Request is already {CUSTOMER_LABELS.get(cur, cur)}")
    # Keep refund/replacement flows consistent with the request type
    if new in REFUND_FLOW and r["type"] != "refund":
        raise HTTPException(status_code=400, detail="This is a replacement request")
    if new in REPLACEMENT_FLOW and r["type"] != "replacement":
        raise HTTPException(status_code=400, detail="This is a refund request")

    update = {"status": new, "updated_at": now_iso()}
    set_ops = {"$set": update}
    push = {"status_history": {"status": new, "at": now_iso(), "note": payload.note or ""}}

    # ----- Replacement approved: check + reserve PIN-specific inventory -----
    if new == "replacement_approved" and not (r.get("replacement") or {}).get("inventory_reserved"):
        key = await _inv_key(r["product_id"], r.get("pincode"), r.get("location_id"))
        inv = await db.inventory.find_one(key, {"_id": 0})
        available = inv.get("available_quantity", 0) if inv else 0
        if available < r["quantity"]:
            raise HTTPException(status_code=400,
                                detail=f"Insufficient stock in PIN {r.get('pincode')} (available {available})")
        await db.inventory.update_one(key, {"$inc": {"available_quantity": -r["quantity"],
                                                     "reserved_quantity": r["quantity"]}})
        update["replacement"] = {**(r.get("replacement") or {}), "inventory_reserved": True,
                                 "reserved_at": now_iso(), "approved_by": admin.get("email")}

    # ----- Replacement delivered: reserved -> sold -----
    if new == "replaced" and (r.get("replacement") or {}).get("inventory_reserved"):
        key = await _inv_key(r["product_id"], r.get("pincode"), r.get("location_id"))
        await db.inventory.update_one(key, {"$inc": {"reserved_quantity": -r["quantity"],
                                                     "sold_quantity": r["quantity"]}})

    # ----- Refunded: online-paid -> Razorpay refund; else wallet credit (idempotent) -----
    if new == "refunded" and not r.get("refund"):
        amount = payload.refund_amount if payload.refund_amount is not None else r["line_amount"]
        amount = round(float(amount), 2)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Refund amount must be greater than 0")
        if amount > r["line_amount"] + 0.01:
            raise HTTPException(status_code=400,
                                detail=f"Refund cannot exceed the item value (₹{r['line_amount']})")
        order = await db.orders.find_one({"id": r["order_id"]}, {"_id": 0})
        is_online = bool(order and order.get("payment_method") == "online"
                         and order.get("razorpay_payment_id")
                         and order.get("payment_status") in ("paid", "refunded"))
        if is_online:
            from routers.payments import refund_payment
            try:
                rf = refund_payment(order["razorpay_payment_id"], amount,
                                    notes={"request": r["request_number"], "product": r["product_name"]})
            except Exception as e:
                raise HTTPException(status_code=400,
                                    detail=f"Razorpay refund failed: {str(e) or 'payment could not be refunded'}")
            update["refund"] = {
                "amount": amount, "reason": r["reason_label"], "method": "razorpay",
                "reference_id": rf.get("id"), "approved_by": admin.get("email"), "at": now_iso(),
            }
        else:
            from routers.wallet import add_wallet_entry
            already = await db.wallet_ledger.find_one({"order_id": r["order_id"], "reason": "refund",
                                                       "notes": {"$regex": r["request_number"]}})
            if not already:
                entry = await add_wallet_entry(
                    r["user_id"], amount, "refund", order_id=r["order_id"], source="refund",
                    notes=f"Refund for {r['request_number']} ({r['product_name']})")
                ledger_id = entry["id"]
            else:
                ledger_id = already.get("id")
            update["refund"] = {
                "amount": amount, "reason": r["reason_label"], "method": payload.refund_method or "wallet",
                "reference_id": ledger_id, "approved_by": admin.get("email"), "at": now_iso(),
            }

    # ----- Rejected after a replacement was reserved: release stock -----
    if new == "rejected" and (r.get("replacement") or {}).get("inventory_reserved"):
        key = await _inv_key(r["product_id"], r.get("pincode"), r.get("location_id"))
        await db.inventory.update_one(key, {"$inc": {"available_quantity": r["quantity"],
                                                     "reserved_quantity": -r["quantity"]}})
        update["replacement"] = {**(r.get("replacement") or {}), "inventory_reserved": False,
                                 "released_at": now_iso()}

    if payload.note:
        push_note = {"note": payload.note, "at": now_iso(), "admin": admin.get("email"), "status": new}
        set_ops["$push"] = {"status_history": push["status_history"], "admin_notes": push_note}
    else:
        set_ops["$push"] = {"status_history": push["status_history"]}

    await db.returns.update_one({"id": request_id}, set_ops)
    updated = await db.returns.find_one({"id": request_id}, {"_id": 0})

    # Notify customer (best effort)
    try:
        from routers.notifications import send_email, EMAIL_FROM_NAME
        u = await db.users.find_one({"_id": ObjectId(r["user_id"])}, {"email": 1, "name": 1})
        if u and u.get("email"):
            label = CUSTOMER_LABELS.get(new, new)
            html = (f'<div style="font-family:Arial,sans-serif;color:#111">'
                    f'<h2 style="color:#1B4332">Request {r["request_number"]}: {label}</h2>'
                    f'<p>{r["product_name"]} × {r["quantity"]} — {r["type"]}</p></div>')
            await send_email(to=u["email"], subject=f"{EMAIL_FROM_NAME}: Request {label}", html=html)
    except Exception:
        pass

    # In-app notification + push
    try:
        from routers.notifications_center import create_user_notification
        label = CUSTOMER_LABELS.get(new, new)
        await create_user_notification(
            r["user_id"], f"{r['type'].capitalize()} {label}",
            f"{r['product_name']} × {r['quantity']} — request {r['request_number']}.",
            deep_link=f"/orders/{r.get('order_id')}", ntype="refund",
            data={"request_id": request_id, "order_id": r.get("order_id")})
    except Exception:
        pass

    return _with_labels(updated)


@router.post("/admin/returns/{request_id}/note")
async def add_return_note(request_id: str, body: dict, admin: dict = Depends(require_admin)):
    note = (body.get("note") or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="Note is required")
    r = await db.returns.find_one({"id": request_id})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    await db.returns.update_one(
        {"id": request_id},
        {"$push": {"admin_notes": {"note": note, "at": now_iso(), "admin": admin.get("email"), "status": r["status"]}},
         "$set": {"updated_at": now_iso()}})
    return await db.returns.find_one({"id": request_id}, {"_id": 0})
