from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import get_current_user, require_admin
from models import WalletAdjustInput, gen_id, now_iso

router = APIRouter()


async def wallet_balance(user_id: str) -> float:
    total = 0.0
    async for l in db.wallet_ledger.find({"user_id": user_id}, {"amount": 1, "_id": 0}):
        total += l.get("amount", 0)
    return round(total, 2)


async def add_wallet_entry(user_id: str, amount: float, reason: str, order_id=None, notes=""):
    entry = {
        "id": gen_id(), "user_id": user_id, "amount": round(amount, 2),
        "reason": reason, "order_id": order_id, "notes": notes,
        "balance_after": round(await wallet_balance(user_id) + amount, 2),
        "created_at": now_iso(),
    }
    await db.wallet_ledger.insert_one(entry)
    entry.pop("_id", None)
    return entry


# ---- Customer ----
@router.get("/me/wallet")
async def my_wallet(user: dict = Depends(get_current_user)):
    ledger = await db.wallet_ledger.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"balance": await wallet_balance(user["id"]), "ledger": ledger}


# ---- Admin ----
@router.get("/admin/wallet/{user_id}")
async def admin_wallet(user_id: str, admin: dict = Depends(require_admin)):
    ledger = await db.wallet_ledger.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"balance": await wallet_balance(user_id), "ledger": ledger}


@router.post("/admin/wallet/adjust")
async def adjust_wallet(payload: WalletAdjustInput, admin: dict = Depends(require_admin)):
    if not await db.users.find_one({"_id": ObjectId(payload.user_id)}):
        raise HTTPException(status_code=404, detail="Customer not found")
    entry = await add_wallet_entry(payload.user_id, payload.amount, payload.reason, payload.order_id, payload.notes)
    return {"balance": await wallet_balance(payload.user_id), "entry": entry}
