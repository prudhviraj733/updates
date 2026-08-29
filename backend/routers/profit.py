"""Order-level profit calculation & profit analytics (ADMIN ONLY).

Profit is computed for the COMPLETE order (never per-product as the primary metric),
entirely from each order's IMMUTABLE snapshot fields — so changing a product's price
or cost later never alters a historical order's profit.

Formula (per order, ex-GST):
    Gross Product Sales   = Σ (item.mrp × qty)
    − Product Discounts    (product_discount + combo_discount)
    − Coupon Discounts     (coupon_discount)
    = Net Product Revenue
    − Total Purchase Cost  (Σ item.cost_price × qty)     [snapshotted at order time]
    = Gross Product Profit
    + Delivery Charge Collected  (delivery_charge + express_charge − delivery_discount)
    − Actual Delivery Cost       (order.delivery_cost, admin-recorded / per-PIN default)
    = ORDER NET PROFIT
    Order Profit Margin % = Order Net Profit ÷ Net Product Revenue × 100

GST (when enabled) is kept OUT of revenue/profit — a collected tax liability, shown separately.
Refunds reduce revenue/profit in period aggregates.
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin
from models import OrderDeliveryCostInput, now_iso

router = APIRouter()


# ---------------------------------------------------------------- core calc
def compute_order_profit(order: dict) -> dict:
    items = order.get("items", []) or []
    gross_sales = round(sum((it.get("mrp") or it.get("unit_price", 0)) * it.get("quantity", 1) for it in items), 2)
    product_discount = round((order.get("product_discount", 0) or 0) + (order.get("combo_discount", 0) or 0), 2)
    coupon_discount = round(order.get("coupon_discount", 0) or 0, 2)

    subtotal = round(order.get("subtotal", 0) or 0, 2)
    net_rev_incl = round(subtotal - coupon_discount, 2)

    gst = order.get("gst") or {}
    gst_enabled = bool(gst.get("enabled"))
    gst_pricing = gst.get("pricing", "inclusive")
    gst_total = round(gst.get("total_tax", 0) or 0, 2) if gst_enabled else 0.0
    # Inclusive pricing embeds GST inside the selling price → strip it out of revenue.
    # Exclusive pricing adds GST on top of subtotal → subtotal is already ex-GST.
    gst_in_revenue = gst_total if (gst_enabled and gst_pricing == "inclusive") else 0.0
    net_product_revenue = round(net_rev_incl - gst_in_revenue, 2)

    purchase_cost = round(sum((it.get("cost_price", 0) or 0) * it.get("quantity", 1) for it in items), 2)
    gross_product_profit = round(net_product_revenue - purchase_cost, 2)

    delivery_collected = round((order.get("delivery_charge", 0) or 0)
                               + (order.get("express_charge", order.get("asap_charge", 0)) or 0)
                               - (order.get("delivery_discount", 0) or 0), 2)
    delivery_cost = round(order.get("delivery_cost", 0) or 0, 2)

    order_net_profit = round(gross_product_profit + delivery_collected - delivery_cost, 2)
    margin = round(order_net_profit / net_product_revenue * 100, 2) if net_product_revenue else 0.0

    return {
        "gross_product_sales": gross_sales,
        "product_discount": product_discount,
        "coupon_discount": coupon_discount,
        "net_product_revenue": net_product_revenue,
        "purchase_cost": purchase_cost,
        "gross_product_profit": gross_product_profit,
        "delivery_charge_collected": delivery_collected,
        "delivery_cost": delivery_cost,
        "order_net_profit": order_net_profit,
        "order_profit_margin_pct": margin,
        "gst_collected": gst_total,
        "gst_enabled": gst_enabled,
        "gst_pricing": gst_pricing,
    }


def is_realized(o: dict) -> bool:
    """An order contributes realized profit when delivered or fully paid (never cancelled)."""
    if o.get("status") == "cancelled":
        return False
    return o.get("status") == "delivered" or o.get("payment_status") in ("paid", "refunded")


async def _refunds_by_order() -> dict:
    """Total refunded amount per order id (wallet-credited + Razorpay refunds)."""
    out = {}
    async for l in db.wallet_ledger.find({"reason": "refund"}, {"order_id": 1, "amount": 1, "_id": 0}):
        oid = l.get("order_id")
        if oid:
            out[oid] = round(out.get(oid, 0) + abs(l.get("amount", 0) or 0), 2)
    async for r in db.returns.find({"refund": {"$ne": None}}, {"order_id": 1, "refund": 1, "_id": 0}):
        rf = r.get("refund") or {}
        if rf.get("method") == "razorpay" and r.get("order_id"):
            out[r["order_id"]] = round(out.get(r["order_id"], 0) + (rf.get("amount", 0) or 0), 2)
    return out


# ---------------------------------------------------------------- period helpers
def _resolve_range(period: str, start: str = None, end: str = None):
    now = datetime.now(timezone.utc)
    today0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "today":
        return today0, today0 + timedelta(days=1), "Today"
    if period == "yesterday":
        return today0 - timedelta(days=1), today0, "Yesterday"
    if period == "week":
        return today0 - timedelta(days=now.weekday()), today0 + timedelta(days=1), "This Week"
    if period == "month":
        return today0.replace(day=1), today0 + timedelta(days=1), "This Month"
    if period == "prev_month":
        m0 = today0.replace(day=1)
        return (m0 - timedelta(days=1)).replace(day=1), m0, "Previous Month"
    if period == "custom":
        if not start or not end:
            raise HTTPException(status_code=400, detail="start and end dates are required for custom range")
        try:
            s = datetime.strptime(start[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            e = datetime.strptime(end[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid date format (use YYYY-MM-DD)")
        return s, e, f"{start[:10]} → {end[:10]}"
    # default = last 30 days
    return today0 - timedelta(days=29), today0 + timedelta(days=1), "Last 30 Days"


def _blank_totals():
    return {"orders": 0, "gross_sales": 0.0, "product_discount": 0.0, "coupon_discount": 0.0,
            "net_revenue": 0.0, "purchase_cost": 0.0, "gross_profit": 0.0,
            "delivery_collected": 0.0, "delivery_cost": 0.0, "refunds": 0.0, "net_profit": 0.0}


def _accumulate(t, p, refund):
    t["orders"] += 1
    t["gross_sales"] += p["gross_product_sales"]
    t["product_discount"] += p["product_discount"]
    t["coupon_discount"] += p["coupon_discount"]
    t["net_revenue"] += p["net_product_revenue"]
    t["purchase_cost"] += p["purchase_cost"]
    t["gross_profit"] += p["gross_product_profit"]
    t["delivery_collected"] += p["delivery_charge_collected"]
    t["delivery_cost"] += p["delivery_cost"]
    t["refunds"] += refund
    t["net_profit"] += p["order_net_profit"] - refund


def _finalize(t):
    for k in list(t.keys()):
        if k != "orders":
            t[k] = round(t[k], 2)
    t["margin_pct"] = round(t["net_profit"] / t["net_revenue"] * 100, 2) if t["net_revenue"] else 0.0
    return t


# ---------------------------------------------------------------- per-order
@router.get("/admin/orders/{order_id}/profit")
async def order_profit(order_id: str, admin: dict = Depends(require_admin)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    p = compute_order_profit(order)
    refunds = await _refunds_by_order()
    refund = refunds.get(order_id, 0.0)
    p["refunded"] = round(refund, 2)
    p["net_profit_after_refund"] = round(p["order_net_profit"] - refund, 2)
    p["realized"] = is_realized(order)
    p["status"] = order.get("status")
    p["payment_status"] = order.get("payment_status")
    return p


@router.put("/admin/orders/{order_id}/delivery-cost")
async def set_delivery_cost(order_id: str, payload: OrderDeliveryCostInput, admin: dict = Depends(require_admin)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    update = {"updated_at": now_iso()}
    if payload.delivery_cost is not None:
        if payload.delivery_cost < 0:
            raise HTTPException(status_code=400, detail="Delivery cost cannot be negative")
        update["delivery_cost"] = round(float(payload.delivery_cost), 2)
    if payload.delivery_charge is not None:
        if payload.delivery_charge < 0:
            raise HTTPException(status_code=400, detail="Delivery charge cannot be negative")
        new_charge = round(float(payload.delivery_charge), 2)
        old_charge = round(order.get("delivery_charge", 0) or 0, 2)
        update["delivery_charge"] = new_charge
        # keep the customer's payable consistent with the adjusted delivery charge
        update["final_amount"] = round((order.get("final_amount", 0) or 0) + (new_charge - old_charge), 2)
    await db.orders.update_one({"id": order_id}, {"$set": update})
    return await order_profit(order_id, admin)


# ---------------------------------------------------------------- dashboard summary
@router.get("/admin/profit/summary")
async def profit_summary(period: str = "month", start: str = None, end: str = None,
                         location_id: str = None, admin: dict = Depends(require_admin)):
    s, e, label = _resolve_range(period, start, end)
    s_iso, e_iso = s.isoformat(), e.isoformat()
    query = {"created_at": {"$gte": s_iso, "$lt": e_iso}}
    if location_id:
        query["location_id"] = location_id
    orders = await db.orders.find(query, {"_id": 0}).to_list(50000)
    refunds = await _refunds_by_order()

    realized = _blank_totals()
    in_progress = _blank_totals()
    cancelled = 0
    daily = {}  # date -> totals
    for o in orders:
        if o.get("status") == "cancelled":
            cancelled += 1
            continue
        p = compute_order_profit(o)
        refund = refunds.get(o.get("id"), 0.0)
        if is_realized(o):
            _accumulate(realized, p, refund)
            day = (o.get("created_at") or "")[:10]
            d = daily.setdefault(day, _blank_totals())
            _accumulate(d, p, refund)
        else:
            _accumulate(in_progress, p, refund)

    daily_rows = [{"date": day, **_finalize(t)} for day, t in sorted(daily.items())]

    return {
        "period": label, "start": s_iso[:10], "end": (e - timedelta(days=1)).isoformat()[:10],
        "realized": _finalize(realized),
        "in_progress": _finalize(in_progress),
        "cancelled_orders": cancelled,
        "daily": daily_rows,
    }


# ---------------------------------------------------------------- product / category breakdown
@router.get("/admin/profit/breakdown")
async def profit_breakdown(period: str = "month", start: str = None, end: str = None,
                           location_id: str = None, admin: dict = Depends(require_admin)):
    s, e, label = _resolve_range(period, start, end)
    query = {"created_at": {"$gte": s.isoformat(), "$lt": e.isoformat()}, "status": {"$ne": "cancelled"}}
    if location_id:
        query["location_id"] = location_id
    orders = await db.orders.find(query, {"_id": 0}).to_list(50000)

    prod, cat, sub, subsub = {}, {}, {}, {}

    def bucket(store, key, name, rev, profit, qty):
        if not key:
            return
        r = store.setdefault(key, {"id": key, "name": name, "qty": 0, "revenue": 0.0, "profit": 0.0})
        r["qty"] += qty
        r["revenue"] += rev
        r["profit"] += profit

    for o in orders:
        if not is_realized(o):
            continue
        for it in o.get("items", []):
            qty = it.get("quantity", 1)
            rev = round((it.get("unit_price", 0) or 0) * qty, 2)
            profit = round(((it.get("unit_price", 0) or 0) - (it.get("cost_price", 0) or 0)) * qty, 2)
            bucket(prod, it.get("product_id"), it.get("name"), rev, profit, qty)
            bucket(cat, it.get("category_id"), None, rev, profit, qty)
            bucket(sub, it.get("subcategory_id"), None, rev, profit, qty)
            bucket(subsub, it.get("subsubcategory_id"), None, rev, profit, qty)

    cats = {c["id"]: c["name"] for c in await db.categories.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)}
    for store in (cat, sub, subsub):
        for r in store.values():
            r["name"] = cats.get(r["id"], "—")

    def fin(rows):
        for r in rows:
            r["revenue"] = round(r["revenue"], 2)
            r["profit"] = round(r["profit"], 2)
            r["margin_pct"] = round(r["profit"] / r["revenue"] * 100, 2) if r["revenue"] else 0.0
        return sorted(rows, key=lambda x: x["profit"], reverse=True)

    return {
        "period": label,
        "by_product": fin(list(prod.values()))[:50],
        "by_category": fin(list(cat.values())),
        "by_subcategory": fin(list(sub.values())),
        "by_subsubcategory": fin(list(subsub.values())),
    }


# ---------------------------------------------------------------- coupon profit impact
@router.get("/admin/profit/coupons")
async def profit_coupons(period: str = "month", start: str = None, end: str = None,
                         admin: dict = Depends(require_admin)):
    s, e, label = _resolve_range(period, start, end)
    query = {"created_at": {"$gte": s.isoformat(), "$lt": e.isoformat()}, "status": {"$ne": "cancelled"}}
    orders = await db.orders.find(query, {"_id": 0}).to_list(50000)
    codes = {c["code"]: c for c in await db.coupons.find({}, {"_id": 0}).to_list(20000)}
    refunds = await _refunds_by_order()

    usage = {}
    for o in orders:
        code = o.get("coupon_code") or o.get("delivery_coupon_code")
        if not code:
            continue
        if not is_realized(o):
            continue
        p = compute_order_profit(o)
        refund = refunds.get(o.get("id"), 0.0)
        u = usage.setdefault(code, {"code": code, "orders": 0, "discount": 0.0, "revenue": 0.0, "profit": 0.0,
                                    "visibility": (codes.get(code, {}) or {}).get("visibility", "public")})
        u["orders"] += 1
        u["discount"] += (o.get("coupon_discount", 0) or 0) + (o.get("delivery_discount", 0) or 0)
        u["revenue"] += p["net_product_revenue"]
        u["profit"] += p["order_net_profit"] - refund
    for u in usage.values():
        u["discount"] = round(u["discount"], 2)
        u["revenue"] = round(u["revenue"], 2)
        u["profit"] = round(u["profit"], 2)
        u["margin_pct"] = round(u["profit"] / u["revenue"] * 100, 2) if u["revenue"] else 0.0
    return {"period": label, "coupons": sorted(usage.values(), key=lambda x: x["orders"], reverse=True)}


# ---------------------------------------------------------------- inventory valuation
@router.get("/admin/profit/inventory")
async def profit_inventory(pincode: str = None, admin: dict = Depends(require_admin)):
    products = {p["id"]: p for p in await db.products.find({"is_active": True}, {"_id": 0}).to_list(20000)}
    query = {"enabled": {"$ne": False}}
    if pincode:
        query["pincode"] = pincode
    rows = await db.inventory.find(query, {"_id": 0}).to_list(50000)

    out = []
    tot_units = 0
    tot_cost = 0.0
    tot_sales = 0.0
    for inv in rows:
        p = products.get(inv.get("product_id"))
        if not p:
            continue
        avail = int(inv.get("available_quantity", 0) or 0)
        if avail <= 0:
            continue
        batches = [b for b in (inv.get("batches") or []) if (b.get("quantity", 0) or 0) > 0]
        priced_qty = sum(int(b["quantity"]) for b in batches if b.get("purchase_price") is not None)
        priced_val = sum(int(b["quantity"]) * float(b["purchase_price"]) for b in batches if b.get("purchase_price") is not None)
        # On-hand units cannot exceed available_quantity (some batch units may be reserved)
        if priced_qty > avail:
            priced_val = round(priced_val / priced_qty * avail, 2) if priced_qty else 0.0
            priced_qty = avail
        remaining = max(0, avail - priced_qty)
        cost_val = round(priced_val + remaining * (p.get("cost_price", 0) or 0), 2)
        sales_val = round(avail * (p.get("selling_price", 0) or 0), 2)
        out.append({
            "product_id": p["id"], "product_name": p.get("name"), "sku": p.get("sku", ""),
            "pincode": inv.get("pincode"),
            "available": avail,
            "avg_purchase_cost": round(cost_val / avail, 2) if avail else 0,
            "inventory_value_at_cost": cost_val,
            "potential_sales_value": sales_val,
            "potential_gross_profit": round(sales_val - cost_val, 2),
        })
        tot_units += avail
        tot_cost += cost_val
        tot_sales += sales_val
    out.sort(key=lambda x: x["inventory_value_at_cost"], reverse=True)
    return {
        "totals": {
            "products": len(out), "units": tot_units,
            "inventory_value_at_cost": round(tot_cost, 2),
            "potential_sales_value": round(tot_sales, 2),
            "potential_gross_profit": round(tot_sales - tot_cost, 2),
            "potential_margin_pct": round((tot_sales - tot_cost) / tot_sales * 100, 2) if tot_sales else 0.0,
        },
        "items": out[:200],
    }
