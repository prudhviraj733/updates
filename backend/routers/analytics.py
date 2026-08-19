from datetime import datetime, timezone, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends

from core.db import db
from core.security import require_admin
from models import ExpenseInput, gen_id, now_iso

router = APIRouter()

RAZORPAY_FEE_PCT = 2.0  # estimated payment gateway fee %


def _paid_or_delivered(o: dict) -> bool:
    return o.get("payment_status") == "paid" or o.get("status") == "delivered"


async def _load_orders(location_id=None, days=None):
    query = {}
    if location_id:
        query["location_id"] = location_id
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(20000)
    if days:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        orders = [o for o in orders if (o.get("created_at") or "") >= cutoff]
    return orders


# ---------------- Financial Control Center ----------------
@router.get("/admin/analytics/overview")
async def analytics_overview(location_id: str = None, days: int = None, admin: dict = Depends(require_admin)):
    orders = await _load_orders(location_id, days)
    valid = [o for o in orders if o.get("status") != "cancelled"]
    cancelled = [o for o in orders if o.get("status") == "cancelled"]

    gross_sales = sum(o.get("subtotal", 0) for o in valid)
    net_revenue = sum(o.get("final_amount", 0) for o in valid)
    product_discount = sum(o.get("product_discount", 0) for o in valid)
    coupon_discount = sum(o.get("coupon_discount", 0) for o in valid)
    delivery_revenue = sum(o.get("delivery_charge", 0) for o in valid)
    asap_revenue = sum(o.get("asap_charge", 0) for o in valid)

    # COGS from item cost snapshots
    cogs = 0.0
    for o in valid:
        for it in o.get("items", []):
            cogs += it.get("cost_price", 0) * it.get("quantity", 1)

    # payment gateway fees (online paid orders)
    gateway_fees = sum(o.get("final_amount", 0) * RAZORPAY_FEE_PCT / 100
                       for o in valid if o.get("payment_method") == "razorpay" and o.get("payment_status") == "paid")

    # refunds from wallet ledger (credits with reason refund)
    refunds = 0.0
    async for l in db.wallet_ledger.find({"reason": "refund"}, {"amount": 1, "_id": 0}):
        refunds += abs(l.get("amount", 0))

    # expenses
    exp_query = {"location_id": location_id} if location_id else {}
    total_expenses = 0.0
    async for e in db.expenses.find(exp_query, {"amount": 1, "_id": 0}):
        total_expenses += e.get("amount", 0)

    gross_profit = net_revenue - cogs
    contribution = gross_profit - gateway_fees - refunds
    estimated_profit = contribution - total_expenses

    return {
        "orders_count": len(valid),
        "cancelled_count": len(cancelled),
        "gross_sales": round(gross_sales, 2),
        "net_revenue": round(net_revenue, 2),
        "average_order_value": round(net_revenue / len(valid), 2) if valid else 0,
        "product_discount": round(product_discount, 2),
        "coupon_discount": round(coupon_discount, 2),
        "total_discount": round(product_discount + coupon_discount, 2),
        "delivery_revenue": round(delivery_revenue, 2),
        "asap_revenue": round(asap_revenue, 2),
        "cogs": round(cogs, 2),
        "gross_profit": round(gross_profit, 2),
        "gross_margin_pct": round(gross_profit / net_revenue * 100, 1) if net_revenue else 0,
        "gateway_fees": round(gateway_fees, 2),
        "refunds": round(refunds, 2),
        "total_expenses": round(total_expenses, 2),
        "contribution": round(contribution, 2),
        "estimated_profit": round(estimated_profit, 2),
    }


@router.get("/admin/analytics/products")
async def analytics_products(location_id: str = None, days: int = None, admin: dict = Depends(require_admin)):
    orders = await _load_orders(location_id, days)
    valid = [o for o in orders if o.get("status") != "cancelled"]
    prod, cat, brand = {}, {}, {}
    for o in valid:
        for it in o.get("items", []):
            pid = it.get("product_id")
            if not pid:
                continue
            qty = it.get("quantity", 1)
            rev = it.get("line_total", it.get("unit_price", 0) * qty)
            profit = (it.get("unit_price", 0) - it.get("cost_price", 0)) * qty
            p = prod.setdefault(pid, {"product_id": pid, "name": it.get("name"), "qty": 0, "revenue": 0, "profit": 0})
            p["qty"] += qty; p["revenue"] += rev; p["profit"] += profit
            if it.get("category_id"):
                c = cat.setdefault(it["category_id"], {"id": it["category_id"], "qty": 0, "revenue": 0, "profit": 0})
                c["qty"] += qty; c["revenue"] += rev; c["profit"] += profit
            if it.get("brand_id"):
                b = brand.setdefault(it["brand_id"], {"id": it["brand_id"], "qty": 0, "revenue": 0, "profit": 0})
                b["qty"] += qty; b["revenue"] += rev; b["profit"] += profit
    # name resolution
    cats = {c["id"]: c["name"] for c in await db.categories.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(2000)}
    brands = {b["id"]: b["name"] for b in await db.brands.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(2000)}
    for c in cat.values():
        c["name"] = cats.get(c["id"], "—")
    for b in brand.values():
        b["name"] = brands.get(b["id"], "—")

    def fin(rows):
        for r in rows:
            r["revenue"] = round(r["revenue"], 2); r["profit"] = round(r["profit"], 2)
        return sorted(rows, key=lambda x: x["revenue"], reverse=True)

    return {
        "top_products": fin(list(prod.values()))[:20],
        "by_category": fin(list(cat.values())),
        "by_brand": fin(list(brand.values())),
    }


@router.get("/admin/analytics/carts")
async def analytics_carts(admin: dict = Depends(require_admin)):
    """Products currently in carts + abandoned cart estimate."""
    carts = await db.carts.find({}, {"_id": 0}).to_list(20000)
    active_carts = [c for c in carts if c.get("items")]
    in_cart_products = {}
    cart_value_total = 0.0
    for c in active_carts:
        for it in c.get("items", []):
            pid = it.get("product_id")
            if not pid:
                continue
            product = await db.products.find_one({"id": pid}, {"_id": 0, "name": 1, "selling_price": 1})
            if not product:
                continue
            qty = it.get("quantity", 1)
            cart_value_total += product.get("selling_price", 0) * qty
            row = in_cart_products.setdefault(pid, {"product_id": pid, "name": product.get("name"), "qty": 0})
            row["qty"] += qty

    # abandoned: carts with items whose user has NO order, or stale carts
    users_with_orders = set(await db.orders.distinct("user_id"))
    abandoned = [c for c in active_carts if c.get("user_id") not in users_with_orders]
    abandoned_value = 0.0
    for c in abandoned:
        for it in c.get("items", []):
            pid = it.get("product_id")
            if not pid:
                continue
            product = await db.products.find_one({"id": pid}, {"_id": 0, "selling_price": 1})
            if product:
                abandoned_value += product.get("selling_price", 0) * it.get("quantity", 1)

    return {
        "active_carts": len(active_carts),
        "cart_value_total": round(cart_value_total, 2),
        "abandoned_carts": len(abandoned),
        "abandoned_value": round(abandoned_value, 2),
        "in_cart_products": sorted(in_cart_products.values(), key=lambda x: x["qty"], reverse=True)[:20],
    }


@router.get("/admin/analytics/coupons")
async def analytics_coupons(admin: dict = Depends(require_admin)):
    orders = await db.orders.find({"status": {"$ne": "cancelled"}, "coupon_code": {"$ne": None}}, {"_id": 0}).to_list(20000)
    usage = {}
    for o in orders:
        code = o.get("coupon_code")
        if not code:
            continue
        u = usage.setdefault(code, {"code": code, "uses": 0, "discount": 0, "revenue": 0})
        u["uses"] += 1
        u["discount"] += o.get("coupon_discount", 0)
        u["revenue"] += o.get("final_amount", 0)
    for u in usage.values():
        u["discount"] = round(u["discount"], 2); u["revenue"] = round(u["revenue"], 2)
    # personalized coupon summary
    pc_total = await db.personalized_coupons.count_documents({})
    pc_redeemed = await db.personalized_coupons.count_documents({"used_count": {"$gt": 0}})
    return {
        "coupon_usage": sorted(usage.values(), key=lambda x: x["uses"], reverse=True),
        "personalized_issued": pc_total,
        "personalized_redeemed": pc_redeemed,
    }


@router.get("/admin/analytics/payments")
async def analytics_payments(admin: dict = Depends(require_admin)):
    orders = await db.orders.find({"status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(20000)
    methods = {}
    for o in orders:
        m = o.get("payment_method", "cod")
        row = methods.setdefault(m, {"method": m, "count": 0, "revenue": 0})
        row["count"] += 1
        row["revenue"] += o.get("final_amount", 0)
    for r in methods.values():
        r["revenue"] = round(r["revenue"], 2)
    return {"by_method": list(methods.values())}


@router.get("/admin/analytics/referrals")
async def analytics_referrals(admin: dict = Depends(require_admin)):
    refs = await db.referrals.find({}, {"_id": 0}).to_list(20000)
    total_reward = sum(r.get("reward", 0) for r in refs)
    by_referrer = {}
    for r in refs:
        row = by_referrer.setdefault(r["referrer_id"], {"referrer_id": r["referrer_id"], "count": 0, "reward": 0})
        row["count"] += 1
        row["reward"] += r.get("reward", 0)
    for uid, row in by_referrer.items():
        try:
            u = await db.users.find_one({"_id": ObjectId(uid)}, {"name": 1})
            row["name"] = (u or {}).get("name", "—")
        except Exception:
            row["name"] = "—"
    top = sorted(by_referrer.values(), key=lambda x: x["count"], reverse=True)[:20]
    with_codes = await db.users.count_documents({"referral_code": {"$exists": True, "$ne": None}})
    return {"total_referrals": len(refs), "total_reward_paid": round(total_reward, 2),
            "customers_with_codes": with_codes, "top_referrers": top}


@router.get("/admin/analytics/wallet")
async def analytics_wallet(admin: dict = Depends(require_admin)):
    by_source = {}
    total_credit = 0.0
    total_debit = 0.0
    total_liability = 0.0
    async for l in db.wallet_ledger.find({}, {"amount": 1, "source": 1, "_id": 0}):
        amt = l.get("amount", 0)
        src = l.get("source", "other")
        total_liability += amt
        if amt >= 0:
            total_credit += amt
        else:
            total_debit += amt
        row = by_source.setdefault(src, {"source": src, "credited": 0, "debited": 0})
        if amt >= 0:
            row["credited"] += amt
        else:
            row["debited"] += abs(amt)
    for r in by_source.values():
        r["credited"] = round(r["credited"], 2); r["debited"] = round(r["debited"], 2)

    topups = await db.wallet_topups.find({"status": "paid"}, {"amount": 1, "_id": 0}).to_list(20000)
    wd_status = {}
    async for w in db.withdrawals.find({}, {"status": 1, "amount": 1, "_id": 0}):
        row = wd_status.setdefault(w["status"], {"status": w["status"], "count": 0, "amount": 0})
        row["count"] += 1
        row["amount"] += w.get("amount", 0)
    for r in wd_status.values():
        r["amount"] = round(r["amount"], 2)

    return {
        "total_liability": round(total_liability, 2),
        "total_credited": round(total_credit, 2),
        "total_debited": round(abs(total_debit), 2),
        "by_source": sorted(by_source.values(), key=lambda x: x["credited"], reverse=True),
        "topups_count": len(topups), "topups_value": round(sum(t["amount"] for t in topups), 2),
        "withdrawals_by_status": list(wd_status.values()),
    }


# ---------------- PIN-wise delivery stats ----------------
@router.get("/admin/analytics/pin-stats")
async def pin_stats(admin: dict = Depends(require_admin)):
    orders = await db.orders.find({"status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(20000)
    pins = {}
    for o in orders:
        pc = (o.get("address") or {}).get("pincode") or "Unknown"
        row = pins.setdefault(pc, {"pincode": pc, "orders": 0, "sales": 0, "customers": set(), "asap": 0})
        row["orders"] += 1
        row["sales"] += o.get("final_amount", 0)
        row["customers"].add(o.get("user_id"))
        if o.get("delivery_type") == "asap":
            row["asap"] += 1
    out = []
    # serviceability map
    pin_docs = {p["pincode"]: p for p in await db.pincodes.find({}, {"_id": 0}).to_list(5000)}
    for pc, r in pins.items():
        cust = len(r["customers"])
        out.append({
            "pincode": pc,
            "orders": r["orders"],
            "sales": round(r["sales"], 2),
            "aov": round(r["sales"] / r["orders"], 2) if r["orders"] else 0,
            "customers": cust,
            "asap_orders": r["asap"],
            "serviceable": pin_docs.get(pc, {}).get("is_serviceable", None),
        })
    out.sort(key=lambda x: x["sales"], reverse=True)
    return {"pins": out}


# ---------------- Expenses ----------------
@router.get("/admin/expenses")
async def list_expenses(admin: dict = Depends(require_admin)):
    docs = await db.expenses.find({}, {"_id": 0}).sort("date", -1).to_list(2000)
    total = sum(d.get("amount", 0) for d in docs)
    return {"expenses": docs, "total": round(total, 2)}


@router.post("/admin/expenses")
async def create_expense(payload: ExpenseInput, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    if not doc.get("date"):
        doc["date"] = datetime.now(timezone.utc).date().isoformat()
    doc.update({"id": gen_id(), "created_at": now_iso()})
    await db.expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/admin/expenses/{expense_id}")
async def delete_expense(expense_id: str, admin: dict = Depends(require_admin)):
    await db.expenses.delete_one({"id": expense_id})
    return {"message": "Expense deleted"}
