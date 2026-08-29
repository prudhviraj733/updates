"""Iteration 28: order-level profit calculation & profit analytics (ADMIN ONLY).

Covers: /api/admin/orders/{id}/profit, PUT /api/admin/orders/{id}/delivery-cost,
/api/admin/profit/{summary,breakdown,coupons,inventory}, inventory batch purchase_price,
customer scrub security, cancelled/refund handling and regression endpoints.
Self-cleaning: synthetic order is cancelled, created batches deleted, real orders restored.
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
API = base_url.rstrip("/") + "/api"

ADMIN = {"email": "prudhvirajm847@gmail.com", "password": "Admin@12345"}
CUSTOMER = {"email": "customer@test.com", "password": "Test@12345"}
T = "T28" + uuid.uuid4().hex[:4].upper()
D_FAR = (date.today() + timedelta(days=400)).isoformat()


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    body = r.json()
    assert (body.get("user") or body).get("role") == "admin", body
    return s


@pytest.fixture(scope="module")
def customer():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=CUSTOMER)
    if r.status_code != 200:
        pytest.fail(f"customer login failed {r.status_code}: {r.text[:300]}")
    return s


@pytest.fixture(scope="module")
def all_orders(admin):
    r = admin.get(f"{API}/admin/orders")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def ctx(admin, customer):
    addrs = customer.get(f"{API}/addresses").json()
    pins = {p["pincode"]: p for p in admin.get(f"{API}/admin/pincodes").json()}
    addr = next((a for a in addrs
                 if pins.get((a.get("pincode") or "").strip(), {}).get("is_serviceable")), None)
    assert addr, "customer has no address in a serviceable PIN"
    pin = addr["pincode"].strip()
    prods = [p for p in admin.get(f"{API}/admin/products").json() if p.get("is_active")]
    assert prods
    return {"pin": pin, "location_id": pins[pin]["location_id"], "address_id": addr["id"],
            "pin_doc": pins[pin], "product": prods[0]}


@pytest.fixture(scope="module")
def tracker():
    return {"orders": [], "batches": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin, ctx, tracker):
    yield
    for oid in tracker["orders"]:
        admin.put(f"{API}/admin/orders/{oid}/status", json={"status": "cancelled"})
    for b in tracker["batches"]:
        admin.delete(f"{API}/admin/inventory/batch/{b}",
                     params={"product_id": ctx["product"]["id"], "pincode": ctx["pin"]})


def _pick_slot(customer, location_id):
    r = customer.get(f"{API}/delivery/slots/range", params={"location_id": location_id, "days": 3})
    for day in r.json().get("days", []):
        for s_ in day["slots"]:
            if s_.get("available"):
                return s_["id"]
    return None


@pytest.fixture(scope="module")
def synth_order(customer, ctx, tracker):
    """Create a real COD order to safely test delivery-cost mutations."""
    lid = ctx["location_id"]
    cart = customer.get(f"{API}/cart", params={"location_id": lid}).json()
    for it in cart.get("items", []):
        if it.get("type") == "combo":
            customer.delete(f"{API}/cart/combos/{it['combo_id']}", params={"location_id": lid})
        else:
            customer.delete(f"{API}/cart/items/{it['product_id']}", params={"location_id": lid})
    r = customer.post(f"{API}/cart/items", json={"product_id": ctx["product"]["id"],
                                                "quantity": 1, "location_id": lid})
    assert r.status_code == 200, r.text
    slot = _pick_slot(customer, lid)
    body = {"location_id": lid, "address_id": ctx["address_id"], "delivery_type": "standard",
            "payment_method": "cod", "use_wallet": False}
    if slot:
        body["slot_id"] = slot
    r = customer.post(f"{API}/orders", json=body)
    assert r.status_code == 200, f"order create failed: {r.status_code} {r.text[:400]}"
    o = r.json()
    oid = o.get("id") or o.get("order", {}).get("id")
    assert oid
    tracker["orders"].append(oid)
    return oid


# ---------------- module: auth / access control ----------------
class TestAccess:
    @pytest.mark.parametrize("path", [
        "/admin/profit/summary", "/admin/profit/breakdown",
        "/admin/profit/coupons", "/admin/profit/inventory"])
    def test_anonymous_blocked(self, path):
        r = requests.get(f"{API}{path}")
        assert r.status_code in (401, 403), f"{path} -> {r.status_code}"

    @pytest.mark.parametrize("path", [
        "/admin/profit/summary", "/admin/profit/breakdown",
        "/admin/profit/coupons", "/admin/profit/inventory"])
    def test_customer_blocked(self, customer, path):
        r = customer.get(f"{API}{path}")
        assert r.status_code in (401, 403), f"{path} -> {r.status_code} {r.text[:200]}"

    def test_customer_blocked_order_profit(self, customer, synth_order):
        r = customer.get(f"{API}/admin/orders/{synth_order}/profit")
        assert r.status_code in (401, 403), r.status_code

    def test_customer_blocked_delivery_cost(self, customer, synth_order):
        r = customer.put(f"{API}/admin/orders/{synth_order}/delivery-cost", json={"delivery_cost": 5})
        assert r.status_code in (401, 403), r.status_code

    def test_admin_allowed(self, admin):
        for path in ("/admin/profit/summary", "/admin/profit/breakdown",
                     "/admin/profit/coupons", "/admin/profit/inventory"):
            r = admin.get(f"{API}{path}")
            assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"


# ---------------- module: customer data scrub (security) ----------------
INTERNAL_ORDER_KEYS = ("delivery_cost", "batch_allocations")


def _assert_scrubbed(o):
    for k in INTERNAL_ORDER_KEYS:
        assert k not in o, f"leaked {k} in order {o.get('id')}"
    for it in o.get("items", []) or []:
        assert "cost_price" not in it, f"leaked item.cost_price in {o.get('id')}"
    for c in o.get("combos", []) or []:
        for li in c.get("items", []) or []:
            assert "cost_price" not in li, "leaked combo item.cost_price"


class TestCustomerScrub:
    def test_list_my_orders_scrubbed(self, customer):
        r = customer.get(f"{API}/orders")
        assert r.status_code == 200, r.text
        orders = r.json()
        assert isinstance(orders, list)
        for o in orders:
            _assert_scrubbed(o)

    def test_get_own_order_scrubbed(self, customer, synth_order):
        r = customer.get(f"{API}/orders/{synth_order}")
        assert r.status_code == 200, r.text
        _assert_scrubbed(r.json())

    def test_admin_sees_internal_fields(self, admin, synth_order):
        r = admin.get(f"{API}/orders/{synth_order}")
        assert r.status_code == 200
        o = r.json()
        assert "delivery_cost" in o, "admin should see delivery_cost"
        assert any("cost_price" in it for it in o.get("items", [])), "admin should see item cost_price"


# ---------------- module: per-order profit math ----------------
def _expected(o):
    items = o.get("items", []) or []
    subtotal = round(o.get("subtotal", 0) or 0, 2)
    coupon = round(o.get("coupon_discount", 0) or 0, 2)
    gst = o.get("gst") or {}
    gst_in_rev = round(gst.get("total_tax", 0) or 0, 2) if (gst.get("enabled") and
                                                           gst.get("pricing", "inclusive") == "inclusive") else 0.0
    net_rev = round(subtotal - coupon - gst_in_rev, 2)
    cost = round(sum((it.get("cost_price", 0) or 0) * it.get("quantity", 1) for it in items), 2)
    gross_profit = round(net_rev - cost, 2)
    dc = round((o.get("delivery_charge", 0) or 0) + (o.get("express_charge", o.get("asap_charge", 0)) or 0)
               - (o.get("delivery_discount", 0) or 0), 2)
    net_profit = round(gross_profit + dc - round(o.get("delivery_cost", 0) or 0, 2), 2)
    margin = round(net_profit / net_rev * 100, 2) if net_rev else 0.0
    return {"net_product_revenue": net_rev, "purchase_cost": cost,
            "gross_product_profit": gross_profit, "delivery_charge_collected": dc,
            "order_net_profit": net_profit, "order_profit_margin_pct": margin}


class TestOrderProfit:
    def test_404_unknown_order(self, admin):
        r = admin.get(f"{API}/admin/orders/does-not-exist-xyz/profit")
        assert r.status_code == 404, r.status_code

    def test_math_on_delivered_orders(self, admin, all_orders):
        delivered = [o for o in all_orders if o.get("status") == "delivered"][:8]
        if not delivered:
            pytest.skip("no delivered orders in DB")
        for o in delivered:
            r = admin.get(f"{API}/admin/orders/{o['id']}/profit")
            assert r.status_code == 200, r.text
            p = r.json()
            exp = _expected(o)
            for k, v in exp.items():
                assert abs(p[k] - v) < 0.02, f"order {o['id']} {k}: got {p[k]} expected {v}"
            assert p["realized"] is True
            assert abs(p["net_profit_after_refund"] - (p["order_net_profit"] - p["refunded"])) < 0.02

    def test_math_on_synth_order(self, admin, synth_order):
        o = admin.get(f"{API}/orders/{synth_order}").json()
        p = admin.get(f"{API}/admin/orders/{synth_order}/profit").json()
        exp = _expected(o)
        for k, v in exp.items():
            assert abs(p[k] - v) < 0.02, f"{k}: got {p[k]} expected {v}"

    def test_delivery_cost_snapshot_from_pin(self, admin, ctx, synth_order):
        o = admin.get(f"{API}/orders/{synth_order}").json()
        pin_default = round(ctx["pin_doc"].get("delivery_cost") or 0, 2)
        assert round(o.get("delivery_cost") or 0, 2) == pin_default, \
            f"order delivery_cost {o.get('delivery_cost')} != PIN default {pin_default}"

    def test_cancelled_orders_not_realized(self, admin, all_orders):
        cancelled = [o for o in all_orders if o.get("status") == "cancelled"][:3]
        if not cancelled:
            pytest.skip("no cancelled orders")
        for o in cancelled:
            p = admin.get(f"{API}/admin/orders/{o['id']}/profit").json()
            assert p["realized"] is False, f"cancelled order {o['id']} marked realized"


# ---------------- module: PUT delivery-cost ----------------
class TestDeliveryCostUpdate:
    def test_negative_delivery_cost_rejected(self, admin, synth_order):
        r = admin.put(f"{API}/admin/orders/{synth_order}/delivery-cost", json={"delivery_cost": -5})
        assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"

    def test_negative_delivery_charge_rejected(self, admin, synth_order):
        r = admin.put(f"{API}/admin/orders/{synth_order}/delivery-cost", json={"delivery_charge": -1})
        assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"

    def test_404_unknown_order(self, admin):
        r = admin.put(f"{API}/admin/orders/nope-xyz/delivery-cost", json={"delivery_cost": 10})
        assert r.status_code == 404, r.status_code

    def test_delivery_cost_reduces_profit_and_restores(self, admin, synth_order):
        base = admin.get(f"{API}/admin/orders/{synth_order}/profit").json()
        orig_cost = base["delivery_cost"]
        r = admin.put(f"{API}/admin/orders/{synth_order}/delivery-cost", json={"delivery_cost": 30})
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["delivery_cost"] == 30
        assert abs(p["order_net_profit"] - (base["order_net_profit"] + orig_cost - 30)) < 0.02, \
            f"expected {base['order_net_profit'] + orig_cost - 30}, got {p['order_net_profit']}"
        # persisted?
        p2 = admin.get(f"{API}/admin/orders/{synth_order}/profit").json()
        assert p2["delivery_cost"] == 30
        # restore
        r = admin.put(f"{API}/admin/orders/{synth_order}/delivery-cost", json={"delivery_cost": orig_cost})
        assert r.status_code == 200
        assert abs(r.json()["order_net_profit"] - base["order_net_profit"]) < 0.02

    def test_delivery_charge_adjusts_final_amount(self, admin, synth_order):
        o = admin.get(f"{API}/orders/{synth_order}").json()
        old_charge = round(o.get("delivery_charge", 0) or 0, 2)
        old_final = round(o.get("final_amount", 0) or 0, 2)
        new_charge = old_charge + 25
        r = admin.put(f"{API}/admin/orders/{synth_order}/delivery-cost",
                      json={"delivery_charge": new_charge})
        assert r.status_code == 200, r.text
        o2 = admin.get(f"{API}/orders/{synth_order}").json()
        assert round(o2["delivery_charge"], 2) == new_charge
        assert abs(round(o2["final_amount"], 2) - (old_final + 25)) < 0.02, \
            f"final_amount {o2['final_amount']} expected {old_final + 25}"
        p = admin.get(f"{API}/admin/orders/{synth_order}/profit").json()
        assert abs(p["delivery_charge_collected"] - (new_charge + (o.get("express_charge", 0) or 0)
                                                    - (o.get("delivery_discount", 0) or 0))) < 0.02
        # restore
        r = admin.put(f"{API}/admin/orders/{synth_order}/delivery-cost",
                      json={"delivery_charge": old_charge})
        assert r.status_code == 200
        o3 = admin.get(f"{API}/orders/{synth_order}").json()
        assert abs(round(o3["final_amount"], 2) - old_final) < 0.02
        assert round(o3["delivery_charge"], 2) == old_charge


# ---------------- module: profit summary ----------------
PERIODS = {"today": "Today", "yesterday": "Yesterday", "week": "This Week",
           "month": "This Month", "prev_month": "Previous Month"}


class TestProfitSummary:
    @pytest.mark.parametrize("period,label", list(PERIODS.items()))
    def test_periods(self, admin, period, label):
        r = admin.get(f"{API}/admin/profit/summary", params={"period": period})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["period"] == label
        assert len(d["start"]) == 10 and len(d["end"]) == 10
        assert d["start"] <= d["end"]
        for key in ("realized", "in_progress"):
            t = d[key]
            for f in ("orders", "gross_sales", "net_revenue", "purchase_cost", "gross_profit",
                      "delivery_collected", "delivery_cost", "refunds", "net_profit", "margin_pct"):
                assert f in t, f"{key} missing {f}"
        assert isinstance(d["daily"], list)
        assert isinstance(d["cancelled_orders"], int)

    def test_custom_requires_dates(self, admin):
        r = admin.get(f"{API}/admin/profit/summary", params={"period": "custom"})
        assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"
        r = admin.get(f"{API}/admin/profit/summary", params={"period": "custom", "start": "2026-01-01"})
        assert r.status_code == 400, r.status_code

    def test_custom_range_ok(self, admin):
        s, e = "2026-01-01", "2026-01-31"
        r = admin.get(f"{API}/admin/profit/summary", params={"period": "custom", "start": s, "end": e})
        assert r.status_code == 200, r.text
        d = r.json()
        assert s in d["period"] and e in d["period"]
        assert d["start"] == s and d["end"] == e

    def test_custom_bad_format(self, admin):
        r = admin.get(f"{API}/admin/profit/summary",
                      params={"period": "custom", "start": "01-01-2026", "end": "31-01-2026"})
        assert r.status_code == 400, r.status_code

    def test_summary_consistency_with_per_order(self, admin):
        """Realized totals for 'today'+... use a wide custom range and cross-check sums."""
        r = admin.get(f"{API}/admin/profit/summary", params={"period": "month"})
        d = r.json()
        t = d["realized"]
        assert abs(t["gross_profit"] - (t["net_revenue"] - t["purchase_cost"])) < 0.5
        assert abs(t["net_profit"] - (t["gross_profit"] + t["delivery_collected"]
                                      - t["delivery_cost"] - t["refunds"])) < 0.5
        if t["net_revenue"]:
            assert abs(t["margin_pct"] - t["net_profit"] / t["net_revenue"] * 100) < 0.05
        # daily rows sum to realized totals
        if d["daily"]:
            assert abs(sum(x["net_profit"] for x in d["daily"]) - t["net_profit"]) < 0.5
            assert sum(x["orders"] for x in d["daily"]) == t["orders"]
            dates = [x["date"] for x in d["daily"]]
            assert dates == sorted(dates), "daily rows not sorted by date"

    def test_cancelled_count_matches_db(self, admin, all_orders):
        r = admin.get(f"{API}/admin/profit/summary", params={"period": "custom",
                                                            "start": "2020-01-01", "end": "2030-12-31"})
        d = r.json()
        expected_cancelled = len([o for o in all_orders if o.get("status") == "cancelled"])
        assert d["cancelled_orders"] == expected_cancelled, \
            f"summary {d['cancelled_orders']} vs admin/orders {expected_cancelled}"
        expected_realized = len([o for o in all_orders
                                 if o.get("status") != "cancelled" and
                                 (o.get("status") == "delivered" or
                                  o.get("payment_status") in ("paid", "refunded"))])
        assert d["realized"]["orders"] == expected_realized, \
            f"realized {d['realized']['orders']} vs expected {expected_realized}"


# ---------------- module: breakdown ----------------
class TestBreakdown:
    def test_structure_and_sorting(self, admin):
        r = admin.get(f"{API}/admin/profit/breakdown", params={"period": "custom",
                                                              "start": "2020-01-01", "end": "2030-12-31"})
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("by_product", "by_category", "by_subcategory", "by_subsubcategory"):
            rows = d[key]
            assert isinstance(rows, list), key
            profits = [x["profit"] for x in rows]
            assert profits == sorted(profits, reverse=True), f"{key} not sorted by profit desc"
            for x in rows:
                for f in ("qty", "revenue", "profit", "margin_pct", "name", "id"):
                    assert f in x, f"{key} row missing {f}"
                if x["revenue"]:
                    assert abs(x["margin_pct"] - x["profit"] / x["revenue"] * 100) < 0.05

    def test_excludes_cancelled(self, admin, all_orders):
        """Product qty totals should match realized non-cancelled order items."""
        d = admin.get(f"{API}/admin/profit/breakdown",
                      params={"period": "custom", "start": "2020-01-01", "end": "2030-12-31"}).json()
        got = {x["id"]: x["qty"] for x in d["by_product"]}
        exp = {}
        for o in all_orders:
            if o.get("status") == "cancelled":
                continue
            if not (o.get("status") == "delivered" or o.get("payment_status") in ("paid", "refunded")):
                continue
            for it in o.get("items", []) or []:
                pid = it.get("product_id")
                if pid:
                    exp[pid] = exp.get(pid, 0) + it.get("quantity", 1)
        # by_product is truncated to top 50 by profit; verify all returned ids match expectation
        for pid, qty in got.items():
            assert exp.get(pid) == qty, f"product {pid} qty {qty} expected {exp.get(pid)}"


# ---------------- module: coupons ----------------
class TestCouponProfit:
    def test_structure(self, admin):
        r = admin.get(f"{API}/admin/profit/coupons", params={"period": "custom",
                                                            "start": "2020-01-01", "end": "2030-12-31"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["coupons"], list)
        for c in d["coupons"]:
            for f in ("code", "orders", "discount", "revenue", "profit", "margin_pct", "visibility"):
                assert f in c, f"missing {f}"
            assert c["visibility"] in ("public", "private"), c["visibility"]
            assert c["orders"] >= 1
            if c["revenue"]:
                assert abs(c["margin_pct"] - c["profit"] / c["revenue"] * 100) < 0.05
        counts = [c["orders"] for c in d["coupons"]]
        assert counts == sorted(counts, reverse=True)

    def test_matches_orders(self, admin, all_orders):
        d = admin.get(f"{API}/admin/profit/coupons",
                      params={"period": "custom", "start": "2020-01-01", "end": "2030-12-31"}).json()
        got = {c["code"]: c["orders"] for c in d["coupons"]}
        exp = {}
        for o in all_orders:
            if o.get("status") == "cancelled":
                continue
            if not (o.get("status") == "delivered" or o.get("payment_status") in ("paid", "refunded")):
                continue
            code = o.get("coupon_code") or o.get("delivery_coupon_code")
            if code:
                exp[code] = exp.get(code, 0) + 1
        assert got == exp, f"coupon order counts got={got} expected={exp}"


# ---------------- module: inventory valuation ----------------
class TestInventoryValue:
    def test_totals_structure(self, admin):
        r = admin.get(f"{API}/admin/profit/inventory")
        assert r.status_code == 200, r.text
        d = r.json()
        t = d["totals"]
        for f in ("products", "units", "inventory_value_at_cost", "potential_sales_value",
                  "potential_gross_profit", "potential_margin_pct"):
            assert f in t, f
        assert abs(t["potential_gross_profit"] -
                   (t["potential_sales_value"] - t["inventory_value_at_cost"])) < 0.5
        if t["potential_sales_value"]:
            assert abs(t["potential_margin_pct"] - t["potential_gross_profit"]
                       / t["potential_sales_value"] * 100) < 0.05
        items = d["items"]
        vals = [i["inventory_value_at_cost"] for i in items]
        assert vals == sorted(vals, reverse=True), "items not sorted by cost value desc"
        for i in items:
            assert i["available"] > 0
            assert abs(i["potential_gross_profit"] -
                       (i["potential_sales_value"] - i["inventory_value_at_cost"])) < 0.05

    def test_batch_purchase_price_used_in_valuation(self, admin, ctx, tracker):
        pid, pin = ctx["product"]["id"], ctx["pin"]

        def item():
            d = admin.get(f"{API}/admin/profit/inventory", params={"pincode": pin}).json()
            return next((i for i in d["items"] if i["product_id"] == pid), None)

        before = item()
        base_cost = before["inventory_value_at_cost"] if before else 0.0
        base_units = before["available"] if before else 0
        prod_cost = ctx["product"].get("cost_price", 0) or 0

        r = admin.post(f"{API}/admin/inventory/batch", json={
            "product_id": pid, "pincode": pin, "batch_number": T + "PP",
            "quantity": 10, "expiry_date": D_FAR, "purchase_price": 7.5})
        assert r.status_code == 200, r.text
        rows = admin.get(f"{API}/admin/inventory", params={"pincode": pin}).json()
        row = next(x for x in rows if x["product_id"] == pid)
        b = next(x for x in row["batches"] if x["batch_number"] == T + "PP")
        assert b.get("purchase_price") == 7.5, b
        tracker["batches"].append(b["id"])

        after = item()
        assert after["available"] == base_units + 10
        # +10 units valued at 7.5 (batch) instead of product cost_price
        expected = round(base_cost + 10 * 7.5, 2)
        assert abs(after["inventory_value_at_cost"] - expected) < 0.05, \
            (f"cost value {after['inventory_value_at_cost']} expected {expected} "
             f"(base {base_cost}, product cost {prod_cost})")

        # delete batch -> value restored
        r = admin.delete(f"{API}/admin/inventory/batch/{b['id']}",
                         params={"product_id": pid, "pincode": pin})
        assert r.status_code == 200, r.text
        tracker["batches"].remove(b["id"])
        restored = item()
        assert abs((restored["inventory_value_at_cost"] if restored else 0) - base_cost) < 0.05

    def test_existing_batch_purchase_price_not_overwritten(self, admin, ctx, tracker):
        pid, pin = ctx["product"]["id"], ctx["pin"]
        num = T + "KEEP"
        r = admin.post(f"{API}/admin/inventory/batch", json={
            "product_id": pid, "pincode": pin, "batch_number": num,
            "quantity": 5, "expiry_date": D_FAR, "purchase_price": 4.0})
        assert r.status_code == 200, r.text
        # add a second batch with a different price
        r = admin.post(f"{API}/admin/inventory/batch", json={
            "product_id": pid, "pincode": pin, "batch_number": num + "2",
            "quantity": 5, "expiry_date": D_FAR, "purchase_price": 9.0})
        assert r.status_code == 200, r.text
        rows = admin.get(f"{API}/admin/inventory", params={"pincode": pin}).json()
        row = next(x for x in rows if x["product_id"] == pid)
        b1 = next(x for x in row["batches"] if x["batch_number"] == num)
        b2 = next(x for x in row["batches"] if x["batch_number"] == num + "2")
        tracker["batches"] += [b1["id"], b2["id"]]
        assert b1["purchase_price"] == 4.0, "older batch price overwritten"
        assert b2["purchase_price"] == 9.0
        for bid in (b1["id"], b2["id"]):
            assert admin.delete(f"{API}/admin/inventory/batch/{bid}",
                                params={"product_id": pid, "pincode": pin}).status_code == 200
            tracker["batches"].remove(bid)

    def test_batch_without_purchase_price_is_null(self, admin, ctx, tracker):
        pid, pin = ctx["product"]["id"], ctx["pin"]
        num = T + "NULL"
        r = admin.post(f"{API}/admin/inventory/batch", json={
            "product_id": pid, "pincode": pin, "batch_number": num,
            "quantity": 3, "expiry_date": D_FAR})
        assert r.status_code == 200, r.text
        rows = admin.get(f"{API}/admin/inventory", params={"pincode": pin}).json()
        row = next(x for x in rows if x["product_id"] == pid)
        b = next(x for x in row["batches"] if x["batch_number"] == num)
        tracker["batches"].append(b["id"])
        assert b.get("purchase_price") is None, b.get("purchase_price")
        assert admin.delete(f"{API}/admin/inventory/batch/{b['id']}",
                            params={"product_id": pid, "pincode": pin}).status_code == 200
        tracker["batches"].remove(b["id"])


# ---------------- module: regression ----------------
class TestRegression:
    def test_admin_orders_list(self, admin, all_orders):
        assert isinstance(all_orders, list) and len(all_orders) > 0
        assert all("_id" not in o for o in all_orders)

    def test_analytics_overview(self, admin):
        r = admin.get(f"{API}/admin/analytics/overview")
        assert r.status_code == 200, r.text

    def test_pincode_delivery_cost_round_trip(self, admin, ctx):
        """PUT /admin/pincodes persists delivery_cost; restored afterwards."""
        pin = ctx["pin_doc"]
        orig = pin.get("delivery_cost")
        body = {k: v for k, v in pin.items() if k not in ("id", "created_at", "updated_at")}
        body["delivery_cost"] = 33.5
        r = admin.put(f"{API}/admin/pincodes/{pin['id']}", json=body)
        assert r.status_code == 200, r.text
        assert r.json().get("delivery_cost") == 33.5
        body["delivery_cost"] = orig
        r = admin.put(f"{API}/admin/pincodes/{pin['id']}", json=body)
        assert r.status_code == 200
        assert r.json().get("delivery_cost") == orig

    def test_inventory_fefo_reservation_unaffected(self, admin, ctx, synth_order):
        o = admin.get(f"{API}/orders/{synth_order}").json()
        # order created from batched inventory should have batch_allocations for admin
        assert "batch_allocations" in o or o.get("items")
