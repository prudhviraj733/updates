import random
import string

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import get_current_user, require_admin
from models import gen_id, now_iso

router = APIRouter()


def _gen_ref_code(name: str) -> str:
    base = "".join(ch for ch in (name or "FR").upper() if ch.isalnum())[:4] or "FRSH"
    return base + "".join(random.choices(string.ascii_uppercase + string.digits, k=4))


async def get_or_create_ref_code(user: dict) -> str:
    if user.get("referral_code"):
        return user["referral_code"]
    code = _gen_ref_code(user.get("name", ""))
    while await db.users.find_one({"referral_code": code}):
        code = _gen_ref_code(user.get("name", ""))
    await db.users.update_one({"_id": ObjectId(user["id"] if "id" in user else user["_id"])},
                              {"$set": {"referral_code": code}})
    return code


@router.get("/me/referral")
async def my_referral(user: dict = Depends(get_current_user)):
    code = await get_or_create_ref_code(user)
    referrals = await db.referrals.find({"referrer_id": user["id"]}, {"_id": 0}).to_list(500)
    return {"referral_code": code, "referrals": referrals, "count": len(referrals)}


@router.post("/referral/apply")
async def apply_referral(code: str, user: dict = Depends(get_current_user)):
    """Apply a friend's referral code once. Credits both wallets."""
    code = code.strip().upper()
    if await db.referrals.find_one({"referred_id": user["id"]}):
        raise HTTPException(status_code=400, detail="You have already used a referral code")
    referrer = await db.users.find_one({"referral_code": code})
    if not referrer:
        raise HTTPException(status_code=404, detail="Invalid referral code")
    referrer_id = str(referrer["_id"])
    if referrer_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot use your own referral code")

    from routers.wallet import add_wallet_entry
    await db.referrals.insert_one({
        "id": gen_id(), "referrer_id": referrer_id, "referred_id": user["id"],
        "referred_name": user.get("name"), "reward": 100, "created_at": now_iso(),
    })
    await add_wallet_entry(referrer_id, 100, "referral", notes=f"Referral bonus: {user.get('name')}")
    await add_wallet_entry(user["id"], 50, "referral", notes="Welcome referral bonus")
    return {"message": "Referral applied! ₹50 added to your wallet."}


@router.get("/admin/referrals")
async def admin_referrals(admin: dict = Depends(require_admin)):
    """Referral overview for admin: referrers, referred customers, rewards, stats."""
    from collections import defaultdict
    refs = await db.referrals.find({}, {"_id": 0}).to_list(20000)
    by_ref = defaultdict(list)
    for r in refs:
        by_ref[r["referrer_id"]].append(r)
    rows = []
    total_reward = 0.0
    for rid, items in by_ref.items():
        u = None
        if ObjectId.is_valid(rid):
            u = await db.users.find_one({"_id": ObjectId(rid)}, {"password": 0})
        reward = sum(i.get("reward", 0) for i in items)
        total_reward += reward
        rows.append({
            "referrer_id": rid,
            "referrer_name": (u.get("name") if u else "—"),
            "referrer_email": (u.get("email") if u else "—"),
            "referral_code": (u.get("referral_code") if u else None),
            "referred_count": len(items),
            "reward_paid": round(reward, 2),
            "referred": [{"name": i.get("referred_name"), "reward": i.get("reward", 0),
                          "date": i.get("created_at")} for i in items],
        })
    rows.sort(key=lambda r: r["referred_count"], reverse=True)
    with_codes = await db.users.count_documents({"referral_code": {"$exists": True, "$ne": None}})
    return {
        "summary": {
            "total_referrals": len(refs),
            "total_referrers": len(by_ref),
            "total_reward_paid": round(total_reward, 2),
            "users_with_codes": with_codes,
            "anti_self_referral": "Enforced — self-referral blocked at apply time",
        },
        "referrers": rows,
    }
