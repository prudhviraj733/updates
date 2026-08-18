import hashlib
import os

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import get_current_user, require_admin
from models import (WalletAdjustInput, WalletTopupInput, WalletWithdrawInput,
                    WithdrawalStatusInput, gen_id, now_iso)
from routers.settings import load_settings

router = APIRouter()

# Credit sources that represent money INTO the wallet
CREDIT_SOURCES = {"topup", "refund", "referral", "promotional", "admin_credit", "cashback", "milestone"}
WITHDRAWAL_STATUSES = ["pending", "approved", "processing", "completed", "rejected", "failed"]


async def wallet_balance(user_id: str) -> float:
    total = 0.0
    async for l in db.wallet_ledger.find({"user_id": user_id}, {"amount": 1, "status": 1, "_id": 0}):
        if l.get("status") == "cancelled":
            continue
        total += l.get("amount", 0)
    return round(total, 2)


async def withdrawable_balance(user_id: str, settings: dict = None) -> float:
    if settings is None:
        settings = await load_settings()
    allowed = set(settings.get("withdrawable_sources", []))
    gross = 0.0
    held = 0.0
    async for l in db.wallet_ledger.find({"user_id": user_id}, {"amount": 1, "source": 1, "status": 1, "_id": 0}):
        if l.get("status") == "cancelled":
            continue
        src = l.get("source")
        amt = l.get("amount", 0)
        if amt > 0 and src in allowed:
            gross += amt
        if src == "withdrawal":          # active holds / completed withdrawals (negative)
            held += abs(amt)
    total = await wallet_balance(user_id)
    return round(max(0.0, min(total, gross - held)), 2)


async def add_wallet_entry(user_id, amount, reason, order_id=None, notes="",
                           source=None, withdrawable=None, status="completed",
                           payment_ref=None):
    """Append an auditable wallet ledger entry. source drives withdrawability."""
    if source is None:
        source = reason
    if withdrawable is None:
        settings = await load_settings()
        withdrawable = amount > 0 and source in set(settings.get("withdrawable_sources", []))
    entry = {
        "id": gen_id(), "txn_id": "WT" + gen_id().replace("-", "")[:12].upper(),
        "user_id": user_id, "amount": round(amount, 2),
        "reason": reason, "source": source, "withdrawable": bool(withdrawable),
        "status": status, "order_id": order_id, "payment_ref": payment_ref, "notes": notes,
        "balance_after": round(await wallet_balance(user_id) + amount, 2),
        "created_at": now_iso(),
    }
    await db.wallet_ledger.insert_one(entry)
    entry.pop("_id", None)
    return entry


def _client():
    key_id = os.environ.get("RAZORPAY_KEY_ID", "")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    if not key_id or not key_secret:
        return None
    import razorpay
    return razorpay.Client(auth=(key_id, key_secret))


# ================= Customer =================
@router.get("/me/wallet")
async def my_wallet(user: dict = Depends(get_current_user)):
    settings = await load_settings()
    ledger = await db.wallet_ledger.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    withdrawals = await db.withdrawals.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {
        "balance": await wallet_balance(user["id"]),
        "withdrawable_balance": await withdrawable_balance(user["id"], settings),
        "min_withdrawal": settings.get("min_withdrawal", 0),
        "withdrawals_enabled": settings.get("withdrawals_enabled", False),
        "ledger": ledger,
        "withdrawals": withdrawals,
    }


@router.post("/me/wallet/topup/create-order")
async def topup_create_order(payload: WalletTopupInput, user: dict = Depends(get_current_user)):
    if payload.amount < 1:
        raise HTTPException(status_code=400, detail="Enter a valid amount")
    client = _client()
    if not client:
        raise HTTPException(status_code=503, detail="Online payment is not configured. Please add Razorpay keys.")
    amount_paise = int(round(payload.amount * 100))
    rzp_order = client.order.create({"amount": amount_paise, "currency": "INR",
                                     "receipt": ("TOPUP" + gen_id())[:40], "payment_capture": 1})
    await db.wallet_topups.insert_one({
        "id": gen_id(), "user_id": user["id"], "razorpay_order_id": rzp_order["id"],
        "amount": payload.amount, "status": "pending", "created_at": now_iso(),
    })
    return {"razorpay_order_id": rzp_order["id"], "amount": amount_paise, "currency": "INR",
            "key_id": os.environ.get("RAZORPAY_KEY_ID")}


@router.post("/me/wallet/topup/verify")
async def topup_verify(body: dict, user: dict = Depends(get_current_user)):
    client = _client()
    if not client:
        raise HTTPException(status_code=503, detail="Online payment is not configured")
    rzp_order_id = body.get("razorpay_order_id")
    payment_id = body.get("razorpay_payment_id")
    params = {"razorpay_order_id": rzp_order_id, "razorpay_payment_id": payment_id,
              "razorpay_signature": body.get("razorpay_signature")}
    try:
        client.utility.verify_payment_signature(params)
    except Exception:
        await db.wallet_topups.update_one({"razorpay_order_id": rzp_order_id}, {"$set": {"status": "failed"}})
        raise HTTPException(status_code=400, detail="Payment verification failed")

    topup = await db.wallet_topups.find_one({"razorpay_order_id": rzp_order_id, "user_id": user["id"]})
    if not topup:
        raise HTTPException(status_code=404, detail="Top-up not found")
    # Idempotency: prevent duplicate credit from repeated callbacks
    if topup.get("status") == "paid":
        return {"status": "already_credited", "balance": await wallet_balance(user["id"])}
    if await db.wallet_ledger.find_one({"payment_ref": payment_id, "source": "topup"}):
        await db.wallet_topups.update_one({"razorpay_order_id": rzp_order_id}, {"$set": {"status": "paid"}})
        return {"status": "already_credited", "balance": await wallet_balance(user["id"])}

    entry = await add_wallet_entry(user["id"], topup["amount"], "Wallet top-up", source="topup",
                                   notes="Added money via Razorpay", payment_ref=payment_id)
    await db.wallet_topups.update_one({"razorpay_order_id": rzp_order_id},
                                      {"$set": {"status": "paid", "razorpay_payment_id": payment_id,
                                                "ledger_id": entry["id"], "updated_at": now_iso()}})
    return {"status": "credited", "balance": await wallet_balance(user["id"]), "txn_id": entry["txn_id"]}


@router.post("/me/wallet/withdraw")
async def request_withdrawal(payload: WalletWithdrawInput, user: dict = Depends(get_current_user)):
    settings = await load_settings()
    if not settings.get("withdrawals_enabled", False):
        raise HTTPException(status_code=400, detail="Withdrawals are currently disabled")
    if payload.amount < settings.get("min_withdrawal", 0):
        raise HTTPException(status_code=400, detail=f"Minimum withdrawal is ₹{settings.get('min_withdrawal', 0)}")
    avail = await withdrawable_balance(user["id"], settings)
    if payload.amount > avail:
        raise HTTPException(status_code=400, detail=f"Only ₹{avail} is eligible for withdrawal")
    if payload.method == "upi" and not payload.upi_id:
        raise HTTPException(status_code=400, detail="UPI ID is required")
    if payload.method == "bank" and not (payload.account_number and payload.ifsc):
        raise HTTPException(status_code=400, detail="Account number and IFSC are required")

    req_id = "WD" + gen_id().replace("-", "")[:10].upper()
    # Immediately hold the amount as a ledger debit (auditable)
    hold = await add_wallet_entry(user["id"], -payload.amount, "Withdrawal request",
                                  source="withdrawal", withdrawable=False, status="pending",
                                  notes=f"Hold for withdrawal {req_id}")
    doc = {
        "id": gen_id(), "request_id": req_id, "user_id": user["id"],
        "customer_name": (await db.users.find_one({"_id": ObjectId(user["id"])}, {"name": 1})).get("name"),
        "amount": payload.amount, "method": payload.method, "upi_id": payload.upi_id,
        "account_name": payload.account_name, "account_number": payload.account_number, "ifsc": payload.ifsc,
        "status": "pending", "ledger_hold_id": hold["id"], "admin_note": "",
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.withdrawals.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ================= Admin =================
@router.get("/admin/wallet/{user_id}")
async def admin_wallet(user_id: str, admin: dict = Depends(require_admin)):
    settings = await load_settings()
    ledger = await db.wallet_ledger.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"balance": await wallet_balance(user_id),
            "withdrawable_balance": await withdrawable_balance(user_id, settings), "ledger": ledger}


@router.post("/admin/wallet/adjust")
async def adjust_wallet(payload: WalletAdjustInput, admin: dict = Depends(require_admin)):
    if not await db.users.find_one({"_id": ObjectId(payload.user_id)}):
        raise HTTPException(status_code=404, detail="Customer not found")
    src = "admin_credit" if payload.amount > 0 else "admin_debit"
    entry = await add_wallet_entry(payload.user_id, payload.amount, payload.reason or "Adjustment",
                                   order_id=payload.order_id, notes=payload.notes, source=src)
    return {"balance": await wallet_balance(payload.user_id), "entry": entry}


@router.get("/admin/wallet/overview/balances")
async def admin_wallet_balances(admin: dict = Depends(require_admin)):
    """All customers with non-zero wallet balance."""
    user_ids = await db.wallet_ledger.distinct("user_id")
    rows = []
    for uid in user_ids:
        bal = await wallet_balance(uid)
        if abs(bal) < 0.01:
            continue
        try:
            u = await db.users.find_one({"_id": ObjectId(uid)}, {"name": 1, "email": 1})
        except Exception:
            u = None
        rows.append({"user_id": uid, "name": (u or {}).get("name", "—"),
                     "email": (u or {}).get("email", "—"), "balance": bal,
                     "withdrawable": await withdrawable_balance(uid)})
    rows.sort(key=lambda r: r["balance"], reverse=True)
    total = round(sum(r["balance"] for r in rows), 2)
    return {"balances": rows, "total_liability": total, "customers": len(rows)}


@router.get("/admin/withdrawals")
async def admin_list_withdrawals(status: str = None, admin: dict = Depends(require_admin)):
    query = {"status": status} if status else {}
    docs = await db.withdrawals.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return docs


@router.put("/admin/withdrawals/{withdrawal_id}/status")
async def update_withdrawal(withdrawal_id: str, payload: WithdrawalStatusInput, admin: dict = Depends(require_admin)):
    if payload.status not in WITHDRAWAL_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    wd = await db.withdrawals.find_one({"id": withdrawal_id})
    if not wd:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if wd["status"] in ("completed", "rejected", "failed"):
        raise HTTPException(status_code=400, detail=f"Withdrawal already {wd['status']}")

    # Reject/fail: cancel the hold entry so the amount returns to balance AND becomes withdrawable again
    if payload.status in ("rejected", "failed"):
        if wd.get("ledger_hold_id"):
            await db.wallet_ledger.update_one(
                {"id": wd["ledger_hold_id"]},
                {"$set": {"status": "cancelled",
                          "notes": f"Withdrawal {wd['request_id']} {payload.status} — amount returned"}})
    # On completed, finalize the existing hold entry status (money actually left the wallet)
    if payload.status == "completed" and wd.get("ledger_hold_id"):
        await db.wallet_ledger.update_one({"id": wd["ledger_hold_id"]}, {"$set": {"status": "completed"}})

    await db.withdrawals.update_one({"id": withdrawal_id},
                                    {"$set": {"status": payload.status, "admin_note": payload.admin_note,
                                              "updated_at": now_iso()}})
    return await db.withdrawals.find_one({"id": withdrawal_id}, {"_id": 0})
