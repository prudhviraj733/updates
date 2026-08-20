import os

from fastapi import APIRouter, Depends, HTTPException, Request

from core.db import db
from core.security import get_current_user
from models import now_iso

router = APIRouter()


def _client():
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    if not key_id or not key_secret:
        return None
    import razorpay
    return razorpay.Client(auth=(key_id, key_secret))


def refund_payment(payment_id: str, amount_rupees: float, notes: dict = None) -> dict:
    """Trigger a Razorpay refund to the original payment method. Raises on failure."""
    client = _client()
    if not client:
        raise RuntimeError("Razorpay not configured")
    data = {"amount": int(round(amount_rupees * 100)), "speed": "normal"}
    if notes:
        data["notes"] = notes
    return client.payment.refund(payment_id, data)


@router.get("/payments/config")
async def payment_config():
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    return {"razorpay_enabled": bool(key_id), "razorpay_key_id": key_id}


@router.post("/payments/razorpay/create-order")
async def create_razorpay_order(body: dict, user: dict = Depends(get_current_user)):
    order_id = body.get("order_id")
    order = await db.orders.find_one({"id": order_id, "user_id": user["id"]})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    client = _client()
    if not client:
        raise HTTPException(status_code=503, detail="Online payment is not configured. Please use Cash on Delivery.")
    amount_paise = int(round(order["final_amount"] * 100))
    rzp_order = client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "receipt": order["order_number"][:40],
        "payment_capture": 1,
    })
    await db.orders.update_one({"id": order_id}, {"$set": {"razorpay_order_id": rzp_order["id"], "updated_at": now_iso()}})
    await db.payments.insert_one({
        "order_id": order_id, "razorpay_order_id": rzp_order["id"],
        "amount": order["final_amount"], "status": "pending", "created_at": now_iso(),
    })
    return {"razorpay_order_id": rzp_order["id"], "amount": amount_paise, "currency": "INR",
            "key_id": os.environ.get("RAZORPAY_KEY_ID")}


@router.post("/payments/razorpay/verify")
async def verify_payment(body: dict, user: dict = Depends(get_current_user)):
    client = _client()
    if not client:
        raise HTTPException(status_code=503, detail="Online payment is not configured")
    params = {
        "razorpay_order_id": body.get("razorpay_order_id"),
        "razorpay_payment_id": body.get("razorpay_payment_id"),
        "razorpay_signature": body.get("razorpay_signature"),
    }
    try:
        client.utility.verify_payment_signature(params)
    except Exception:
        await db.orders.update_one({"razorpay_order_id": params["razorpay_order_id"]},
                                   {"$set": {"payment_status": "failed", "updated_at": now_iso()}})
        raise HTTPException(status_code=400, detail="Payment verification failed")
    await db.orders.update_one(
        {"razorpay_order_id": params["razorpay_order_id"], "user_id": user["id"]},
        {"$set": {"payment_status": "paid", "status": "confirmed",
                  "razorpay_payment_id": params["razorpay_payment_id"], "updated_at": now_iso()},
         "$push": {"status_history": {"status": "confirmed", "at": now_iso()}}})
    await db.payments.update_one({"razorpay_order_id": params["razorpay_order_id"]},
                                 {"$set": {"status": "paid", "razorpay_payment_id": params["razorpay_payment_id"]}})
    updated = await db.orders.find_one({"razorpay_order_id": params["razorpay_order_id"]}, {"_id": 0})
    if updated and not updated.get("receipt_sent"):
        await db.orders.update_one({"id": updated["id"]}, {"$set": {"receipt_sent": True}})
        from routers.notifications import send_payment_receipt
        try:
            await send_payment_receipt(updated)
        except Exception:
            pass
    return {"status": "paid"}


@router.post("/payments/webhook")
async def webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
    client = _client()
    if client and secret:
        try:
            client.utility.verify_webhook_signature(payload.decode(), signature, secret)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid webhook signature")

    import json
    try:
        event = json.loads(payload.decode() or "{}")
    except Exception:
        return {"status": "ignored"}

    etype = event.get("event", "")
    entity = (((event.get("payload") or {}).get("payment") or {}).get("entity")) or {}
    rzp_order_id = entity.get("order_id")
    rzp_payment_id = entity.get("id")
    if not rzp_order_id:
        return {"status": "ok"}

    order = await db.orders.find_one({"razorpay_order_id": rzp_order_id})
    if not order:
        return {"status": "ok"}

    if etype in ("payment.captured", "order.paid"):
        # Idempotent: only promote if not already paid
        if order.get("payment_status") != "paid":
            await db.orders.update_one(
                {"razorpay_order_id": rzp_order_id},
                {"$set": {"payment_status": "paid", "status": "confirmed",
                          "razorpay_payment_id": rzp_payment_id, "updated_at": now_iso()},
                 "$push": {"status_history": {"status": "confirmed", "at": now_iso()}}})
            await db.payments.update_one(
                {"razorpay_order_id": rzp_order_id},
                {"$set": {"status": "paid", "razorpay_payment_id": rzp_payment_id, "source": "webhook"}})
            if not order.get("receipt_sent"):
                await db.orders.update_one({"razorpay_order_id": rzp_order_id}, {"$set": {"receipt_sent": True}})
                fresh = await db.orders.find_one({"razorpay_order_id": rzp_order_id}, {"_id": 0})
                from routers.notifications import send_payment_receipt
                try:
                    await send_payment_receipt(fresh)
                except Exception:
                    pass
    elif etype == "payment.failed":
        if order.get("payment_status") not in ("paid", "refunded"):
            await db.orders.update_one(
                {"razorpay_order_id": rzp_order_id},
                {"$set": {"payment_status": "failed", "updated_at": now_iso()}})
            await db.payments.update_one(
                {"razorpay_order_id": rzp_order_id},
                {"$set": {"status": "failed", "razorpay_payment_id": rzp_payment_id, "source": "webhook"}})

    return {"status": "ok"}
