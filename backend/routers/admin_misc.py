from fastapi import APIRouter, Depends

from datetime import datetime, timezone, timedelta

from core.db import db
from core.security import require_admin

router = APIRouter()


def _order_cogs(o: dict) -> float:
    return sum(it.get("cost_price", 0) * it.get("quantity", 1) for it in o.get("items", []))


@router.get("/admin/dashboard/alerts")
async def dashboard_alerts(admin: dict = Depends(require_admin)):
    return {
        "pending_orders": await db.orders.count_documents({"status": "pending"}),
        "low_stock": await db.inventory.count_documents({"available_quantity": {"$lte": 5, "$gt": 0}, "enabled": {"$ne": False}}),
        "out_of_stock": await db.inventory.count_documents({"available_quantity": {"$lte": 0}, "enabled": {"$ne": False}}),
        "return_requests": await db.returns.count_documents({"status": {"$in": ["requested", "under_review"]}}),
    }


@router.get("/admin/dashboard/overview")
async def dashboard_overview(days: int = None, admin: dict = Depends(require_admin)):
    """Real-data business overview for the admin dashboard (7 sections)."""
    orders = await db.orders.find({}, {"_id": 0}).to_list(20000)
    now = datetime.now(timezone.utc)
    today_iso = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    d7 = (now - timedelta(days=7)).isoformat()
    d30 = (now - timedelta(days=30)).isoformat()

    def valid(o):
        return o.get("status") != "cancelled"

    def since(o, cut):
        return (o.get("created_at") or "") >= cut

    # Scoped window for period-based sections (whole-dashboard date range)
    if days and days >= 30:
        scut, plabel = d30, "Last 30 Days"
    elif days and days >= 7:
        scut, plabel = d7, "Last 7 Days"
    else:
        scut, plabel = today_iso, "Today"
    sord = [o for o in orders if valid(o) and since(o, scut)]

    # 1. Period summary (scoped)
    refunds_scoped = 0.0
    async for l in db.wallet_ledger.find({"reason": "refund"}, {"amount": 1, "created_at": 1, "_id": 0}):
        if (l.get("created_at") or "") >= scut:
            refunds_scoped += abs(l.get("amount", 0))
    today_summary = {
        "orders": len(sord),
        "sales": round(sum(o.get("final_amount", 0) for o in sord), 2),
        "profit": round(sum(o.get("final_amount", 0) - _order_cogs(o) for o in sord), 2),
        "discounts": round(sum(o.get("product_discount", 0) + o.get("combo_discount", 0) + o.get("coupon_discount", 0) for o in sord), 2),
        "delivery_collected": round(sum(o.get("delivery_charge", 0) + o.get("express_charge", o.get("asap_charge", 0)) for o in sord), 2),
        "refunds": round(refunds_scoped, 2),
    }

    # 2. Live orders by status
    STATUSES = ["pending", "accepted", "confirmed", "preparing", "ready_for_delivery", "out_for_delivery", "delivered", "cancelled"]
    live_orders = {s: 0 for s in STATUSES}
    for o in orders:
        if o.get("status") in live_orders:
            live_orders[o["status"]] += 1

    # 3. Sales trend
    def window(cut):
        w = [o for o in orders if valid(o) and since(o, cut)]
        return {"orders": len(w),
                "revenue": round(sum(o.get("final_amount", 0) for o in w), 2),
                "profit": round(sum(o.get("final_amount", 0) - _order_cogs(o) for o in w), 2)}
    sales_trend = {"today": window(today_iso), "last_7_days": window(d7), "last_30_days": window(d30)}

    # 4. Inventory alerts
    low_stock = await db.inventory.count_documents({"available_quantity": {"$lte": 5, "$gt": 0}, "enabled": {"$ne": False}})
    out_of_stock = await db.inventory.count_documents({"available_quantity": {"$lte": 0}, "enabled": {"$ne": False}})
    pin_map = {}
    async for inv in db.inventory.find({"pincode": {"$exists": True}, "enabled": {"$ne": False}},
                                       {"pincode": 1, "available_quantity": 1, "low_stock_threshold": 1, "_id": 0}):
        m = pin_map.setdefault(inv["pincode"], {"pincode": inv["pincode"], "low": 0, "out": 0})
        q = inv.get("available_quantity", 0)
        if q <= 0:
            m["out"] += 1
        elif q <= inv.get("low_stock_threshold", 5):
            m["low"] += 1
    pin_issues = sorted([m for m in pin_map.values() if m["low"] or m["out"]],
                        key=lambda x: (x["out"], x["low"]), reverse=True)[:8]
    inventory_alerts = {"low_stock": low_stock, "out_of_stock": out_of_stock, "pin_issues": pin_issues}

    # 5. PIN code performance (scoped)
    perf = {}
    for o in sord:
        pc = o.get("pincode") or "—"
        m = perf.setdefault(pc, {"pincode": pc, "orders": 0, "sales": 0.0, "delivery": 0.0, "customers": set()})
        m["orders"] += 1
        m["sales"] += o.get("final_amount", 0)
        m["delivery"] += o.get("delivery_charge", 0) + o.get("express_charge", o.get("asap_charge", 0))
        if o.get("user_id"):
            m["customers"].add(o["user_id"])
    pin_performance = sorted(
        [{"pincode": m["pincode"], "orders": m["orders"], "sales": round(m["sales"], 2),
          "delivery": round(m["delivery"], 2), "customers": len(m["customers"])} for m in perf.values()],
        key=lambda x: x["sales"], reverse=True)[:10]

    # 6. Customer & marketing alerts
    last_order = {}
    for o in orders:
        uid, ca = o.get("user_id"), o.get("created_at") or ""
        if uid and ca > last_order.get(uid, ""):
            last_order[uid] = ca
    customer_marketing = {
        "new_customers_today": await db.users.count_documents({"role": "customer", "created_at": {"$gte": today_iso}}),
        "new_customers_7d": await db.users.count_documents({"role": "customer", "created_at": {"$gte": d7}}),
        "cart_abandonment": await db.carts.count_documents({"items.0": {"$exists": True}}),
        "stopped_buying": sum(1 for ca in last_order.values() if ca < d30),
        "coupon_usage": len([o for o in sord if o.get("coupon_discount", 0) > 0 or o.get("coupon_code")]),
        "referral_customers": await db.referrals.count_documents({}),
    }

    # 7. Financial snapshot (scoped)
    v = sord
    net_revenue = sum(o.get("final_amount", 0) for o in v)
    cogs = sum(_order_cogs(o) for o in v)
    wallet_credits = wallet_debits = refunds = 0.0
    async for l in db.wallet_ledger.find({}, {"amount": 1, "reason": 1, "_id": 0}):
        amt = l.get("amount", 0)
        if amt >= 0:
            wallet_credits += amt
        else:
            wallet_debits += abs(amt)
        if l.get("reason") == "refund" and amt > 0:
            refunds += amt
    referral_reward_cost = 0.0
    async for r in db.referrals.find({}, {"reward": 1, "_id": 0}):
        referral_reward_cost += r.get("reward", 0)
    financial_snapshot = {
        "gross_sales": round(sum(o.get("subtotal", 0) for o in v), 2),
        "product_discounts": round(sum(o.get("product_discount", 0) + o.get("combo_discount", 0) for o in v), 2),
        "coupon_discounts": round(sum(o.get("coupon_discount", 0) for o in v), 2),
        "delivery_revenue": round(sum(o.get("delivery_charge", 0) + o.get("express_charge", o.get("asap_charge", 0)) for o in v), 2),
        "refunds": round(refunds, 2),
        "wallet_credits": round(wallet_credits, 2),
        "wallet_debits": round(wallet_debits, 2),
        "referral_reward_cost": round(referral_reward_cost, 2),
        "estimated_profit": round(net_revenue - cogs - refunds, 2),
    }

    recent_orders = sorted(orders, key=lambda o: o.get("created_at") or "", reverse=True)[:8]
    recent_orders = [{"id": o.get("id"), "order_number": o.get("order_number"),
                      "customer_name": o.get("customer_name"), "final_amount": o.get("final_amount", 0),
                      "status": o.get("status"), "pincode": o.get("pincode")} for o in recent_orders]

    return {
        "period": plabel,
        "today_summary": today_summary,
        "live_orders": live_orders,
        "sales_trend": sales_trend,
        "inventory_alerts": inventory_alerts,
        "pin_performance": pin_performance,
        "customer_marketing": customer_marketing,
        "financial_snapshot": financial_snapshot,
        "recent_orders": recent_orders,
    }


@router.get("/admin/dashboard/stats")
async def dashboard_stats(admin: dict = Depends(require_admin)):
    total_orders = await db.orders.count_documents({})
    pending_orders = await db.orders.count_documents({"status": "pending"})
    total_products = await db.products.count_documents({"is_active": True})
    total_customers = await db.users.count_documents({"role": "customer"})
    total_locations = await db.locations.count_documents({"is_active": True})

    revenue_cursor = db.orders.find({"payment_status": "paid"}, {"final_amount": 1, "_id": 0})
    revenue = sum([o["final_amount"] async for o in revenue_cursor])

    low_stock = await db.inventory.count_documents({"available_quantity": {"$lte": 5, "$gt": 0}})
    out_of_stock = await db.inventory.count_documents({"available_quantity": {"$lte": 0}})

    recent = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(8)

    # revenue by status
    status_counts = {}
    async for o in db.orders.find({}, {"status": 1, "_id": 0}):
        status_counts[o["status"]] = status_counts.get(o["status"], 0) + 1

    return {
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "total_products": total_products,
        "total_customers": total_customers,
        "total_locations": total_locations,
        "total_revenue": round(revenue, 2),
        "low_stock": low_stock,
        "out_of_stock": out_of_stock,
        "recent_orders": recent,
        "status_counts": status_counts,
    }


@router.get("/admin/customers")
async def list_customers(admin: dict = Depends(require_admin)):
    users = await db.users.find({"role": "customer"}, {"password_hash": 0}).to_list(2000)
    result = []
    for u in users:
        uid = str(u["_id"])
        order_count = await db.orders.count_documents({"user_id": uid})
        addr_count = await db.addresses.count_documents({"user_id": uid})
        result.append({
            "id": uid, "name": u.get("name"), "email": u.get("email"),
            "phone": u.get("phone"), "created_at": u.get("created_at"),
            "order_count": order_count, "address_count": addr_count,
        })
    return result
