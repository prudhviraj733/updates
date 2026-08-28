"""Iteration 26: inventory batches, expiry indicators, low-stock, dashboard summary,
FEFO batch consumption on order + restore on cancel, and legacy (no-batch) compatibility.
Self-cleaning: all created batches are deleted and all created orders are cancelled."""
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
T = "T26" + uuid.uuid4().hex[:4].upper()

D_FAR = (date.today() + timedelta(days=400)).isoformat()
D_SOON = (date.today() + timedelta(days=18)).isoformat()
D_VSOON = (date.today() + timedelta(days=5)).isoformat()
D_EXPIRED = (date.today() - timedelta(days=3)).isoformat()


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    return s


@pytest.fixture(scope="module")
def customer():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=CUSTOMER)
    if r.status_code != 200:
        pytest.fail(f"customer login failed {r.status_code}: {r.text[:300]}")
    return s


@pytest.fixture(scope="module")
def ctx(admin, customer):
    """Serviceable PIN matching a customer address + two active products."""
    addrs = customer.get(f"{API}/addresses").json()
    pins = {p["pincode"]: p for p in admin.get(f"{API}/admin/pincodes").json()}
    addr = next((a for a in addrs
                 if pins.get((a.get("pincode") or "").strip(), {}).get("is_serviceable")), None)
    assert addr, "customer has no address in a serviceable PIN"
    pin = addr["pincode"].strip()
    pin_doc = pins[pin]
    prods = [p for p in admin.get(f"{API}/admin/products").json() if p.get("is_active")]
    assert len(prods) >= 3
    return {"pin": pin, "location_id": pin_doc["location_id"], "address_id": addr["id"],
            "p_batch": prods[0], "p_legacy": prods[1], "p_fefo": prods[2]}


@pytest.fixture(scope="module")
def tracker():
    """(product_id, pincode, batch_id) created during tests, plus order ids."""
    t = {"batches": [], "orders": []}
    return t


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin, ctx, tracker):
    yield
    for oid in tracker["orders"]:
        admin.put(f"{API}/admin/orders/{oid}/status", json={"status": "cancelled"})
    for pid in {ctx["p_batch"]["id"], ctx["p_legacy"]["id"], ctx["p_fefo"]["id"]}:
        row = _row(admin, ctx["pin"], pid)
        for b in (row or {}).get("batches", []):
            if str(b.get("batch_number", "")).startswith(T):
                admin.delete(f"{API}/admin/inventory/batch/{b['id']}",
                             params={"product_id": pid, "pincode": ctx["pin"]})


# ---------- helpers ----------
def _row(sess, pincode, product_id):
    rows = sess.get(f"{API}/admin/inventory", params={"pincode": pincode}).json()
    return next((r for r in rows if r["product_id"] == product_id), None)


def _add_batch(admin, ctx, num, qty, expiry, tracker, threshold=None, key="p_batch"):
    body = {"product_id": ctx[key]["id"], "pincode": ctx["pin"],
            "batch_number": num, "quantity": qty, "expiry_date": expiry}
    if threshold is not None:
        body["low_stock_threshold"] = threshold
    r = admin.post(f"{API}/admin/inventory/batch", json=body)
    assert r.status_code == 200, r.text
    row = _row(admin, ctx["pin"], ctx[key]["id"])
    b = next(b for b in row["batches"] if b["batch_number"] == num)
    tracker["batches"].append(b["id"])
    return b, row


def _pick_slot(customer, location_id):
    r = customer.get(f"{API}/delivery/slots/range", params={"location_id": location_id, "days": 3})
    assert r.status_code == 200, r.text
    for day in r.json()["days"]:
        for s_ in day["slots"]:
            if s_.get("available"):
                return s_["id"]
    return None


def _place_order(customer, ctx):
    body = {"location_id": ctx["location_id"], "address_id": ctx["address_id"],
            "delivery_type": "standard", "payment_method": "cod", "use_wallet": False}
    slot = _pick_slot(customer, ctx["location_id"])
    assert slot, "no delivery slot available"
    body["slot_id"] = slot
    return customer.post(f"{API}/orders", json=body)


def _clear_cart(customer, location_id):
    cart = customer.get(f"{API}/cart", params={"location_id": location_id}).json()
    for it in cart.get("items", []):
        if it.get("type") == "combo":
            customer.delete(f"{API}/cart/combos/{it['combo_id']}", params={"location_id": location_id})
        else:
            customer.delete(f"{API}/cart/items/{it['product_id']}", params={"location_id": location_id})


# ---------- module: inventory batch CRUD + validation ----------
class TestBatchValidation:
    def test_requires_admin(self):
        r = requests.post(f"{API}/admin/inventory/batch",
                          json={"product_id": "x", "pincode": "500034", "batch_number": "B", "quantity": 1})
        assert r.status_code in (401, 403), r.status_code

    def test_zero_quantity_rejected(self, admin, ctx):
        r = admin.post(f"{API}/admin/inventory/batch", json={
            "product_id": ctx["p_batch"]["id"], "pincode": ctx["pin"],
            "batch_number": T + "ZERO", "quantity": 0, "expiry_date": D_FAR})
        assert r.status_code in (400, 422), r.text

    def test_blank_batch_number_rejected(self, admin, ctx):
        r = admin.post(f"{API}/admin/inventory/batch", json={
            "product_id": ctx["p_batch"]["id"], "pincode": ctx["pin"],
            "batch_number": "   ", "quantity": 5, "expiry_date": D_FAR})
        assert r.status_code in (400, 422), r.text

    def test_missing_scope_rejected(self, admin, ctx):
        r = admin.post(f"{API}/admin/inventory/batch", json={
            "product_id": ctx["p_batch"]["id"], "batch_number": T + "NOSCOPE", "quantity": 5})
        assert r.status_code in (400, 422), r.text

    def test_delete_unknown_batch_404(self, admin, ctx):
        r = admin.delete(f"{API}/admin/inventory/batch/{uuid.uuid4().hex}",
                         params={"product_id": ctx["p_batch"]["id"], "pincode": ctx["pin"]})
        assert r.status_code == 404, r.text


# ---------- module: batches kept separate + available_quantity accounting ----------
class TestBatchesAndExpiry:
    def test_add_batches_increase_available_and_stay_separate(self, admin, ctx, tracker):
        before = _row(admin, ctx["pin"], ctx["p_batch"]["id"])["available_quantity"]
        b1, _ = _add_batch(admin, ctx, T + "A", 10, D_VSOON, tracker)
        b2, row = _add_batch(admin, ctx, T + "B", 20, D_FAR, tracker)
        assert row["available_quantity"] == before + 30, row["available_quantity"]
        mine = [b for b in row["batches"] if b["batch_number"].startswith(T)]
        assert {b["batch_number"] for b in mine} >= {T + "A", T + "B"}
        assert {b["quantity"] for b in mine if b["batch_number"] in (T + "A", T + "B")} == {10, 20}
        assert b1["id"] != b2["id"]

    def test_per_batch_expiry_status_and_days(self, admin, ctx, tracker):
        _add_batch(admin, ctx, T + "C", 5, D_SOON, tracker)
        row = _row(admin, ctx["pin"], ctx["p_batch"]["id"])
        st = {b["batch_number"]: b["expiry"] for b in row["batches"] if b["batch_number"].startswith(T)}
        assert st[T + "A"]["status"] == "very_soon" and st[T + "A"]["days"] == 5
        assert st[T + "C"]["status"] == "soon" and st[T + "C"]["days"] == 18
        assert st[T + "B"]["status"] == "normal"
        assert st[T + "A"]["expiry_date"] == D_VSOON

    def test_row_summary_uses_nearest_expiry(self, admin, ctx):
        row = _row(admin, ctx["pin"], ctx["p_batch"]["id"])
        assert row["expiry_status"] == "very_soon", row["expiry_status"]
        assert row["nearest_expiry"] == D_VSOON
        assert row["expiry_days"] == 5
        assert row["batch_count"] >= 3

    def test_expired_batch_flips_row_status(self, admin, ctx, tracker):
        _add_batch(admin, ctx, T + "D", 3, D_EXPIRED, tracker)
        row = _row(admin, ctx["pin"], ctx["p_batch"]["id"])
        assert row["expiry_status"] == "expired"
        assert row["expiry_days"] == -3
        assert row["nearest_expiry"] == D_EXPIRED

    def test_dashboard_expiry_summary_buckets(self, admin, ctx):
        s = admin.get(f"{API}/admin/inventory/expiry-summary", params={"pincode": ctx["pin"]}).json()
        for k in ("total_inventory", "low_stock", "out_of_stock", "expiring_30", "expiring_7", "expired"):
            assert k in s and isinstance(s[k], int), s
        assert s["expired"] >= 1
        assert s["expiring_30"] >= s["expiring_7"]
        assert s["total_inventory"] >= s["low_stock"] + s["out_of_stock"]

    def test_low_stock_threshold_persist_and_flags(self, admin, ctx):
        pid = ctx["p_batch"]["id"]
        row = _row(admin, ctx["pin"], pid)
        orig_avail, orig_th = row["available_quantity"], row["low_stock_threshold"]
        try:
            th = orig_avail + 5
            r = admin.put(f"{API}/admin/inventory", json={
                "product_id": pid, "pincode": ctx["pin"], "available_quantity": orig_avail,
                "low_stock_threshold": th, "enabled": True})
            assert r.status_code == 200, r.text
            row2 = _row(admin, ctx["pin"], pid)
            assert row2["low_stock_threshold"] == th
            assert row2["low_stock"] is True and row2["out_of_stock"] is False
        finally:
            admin.put(f"{API}/admin/inventory", json={
                "product_id": pid, "pincode": ctx["pin"], "available_quantity": orig_avail,
                "low_stock_threshold": orig_th, "enabled": True})

    def test_delete_batch_reduces_available(self, admin, ctx, tracker):
        pid = ctx["p_batch"]["id"]
        row = _row(admin, ctx["pin"], pid)
        target = next(b for b in row["batches"] if b["batch_number"] == T + "D")
        before = row["available_quantity"]
        r = admin.delete(f"{API}/admin/inventory/batch/{target['id']}",
                         params={"product_id": pid, "pincode": ctx["pin"]})
        assert r.status_code == 200, r.text
        row2 = _row(admin, ctx["pin"], pid)
        assert row2["available_quantity"] == before - target["quantity"]
        assert all(b["id"] != target["id"] for b in row2["batches"])
        assert row2["expiry_status"] == "very_soon"


# ---------- module: FEFO consumption on order + restore on cancel ----------
class TestFEFO:
    def test_fefo_earliest_expiry_consumed_first_and_restored_on_cancel(
            self, admin, customer, ctx, tracker):
        pid = ctx["p_fefo"]["id"]
        # fresh, deterministic batches: earliest small qty, later large qty
        b_early, _ = _add_batch(admin, ctx, T + "FE1", 2, D_VSOON, tracker, key="p_fefo")
        b_late, row = _add_batch(admin, ctx, T + "FE2", 20, D_FAR, tracker, key="p_fefo")
        # remove earlier test batches so FE1 is the global earliest with small qty
        for b in row["batches"]:
            if b["batch_number"].startswith(T) and b["batch_number"] not in (T + "FE1", T + "FE2"):
                admin.delete(f"{API}/admin/inventory/batch/{b['id']}",
                             params={"product_id": pid, "pincode": ctx["pin"]})
        row = _row(admin, ctx["pin"], pid)
        # any pre-existing non-test batch with an earlier expiry would break the assertion
        earlier = [b for b in row["batches"]
                   if not b["batch_number"].startswith(T) and b.get("expiry_date")
                   and b["expiry_date"] < D_VSOON]
        assert not earlier, f"pre-existing earlier batches interfere: {earlier}"
        avail_before = row["available_quantity"]
        reserved_before = row["reserved_quantity"]

        _clear_cart(customer, ctx["location_id"])
        r = customer.post(f"{API}/cart/items", json={
            "product_id": pid, "quantity": 3, "location_id": ctx["location_id"]})
        assert r.status_code == 200, r.text
        r = _place_order(customer, ctx)
        assert r.status_code == 200, r.text
        order = r.json()
        tracker["orders"].append(order["id"])

        allocs = [a for a in order.get("batch_allocations") or [] if a["product_id"] == pid]
        assert allocs, "order has no batch_allocations"
        by_num = {a["batch_number"]: a["quantity"] for a in allocs}
        assert by_num.get(T + "FE1") == 2, f"earliest batch not fully consumed first: {allocs}"
        assert by_num.get(T + "FE2") == 1, f"remainder not taken from later batch: {allocs}"

        row_after = _row(admin, ctx["pin"], pid)
        assert row_after["available_quantity"] == avail_before - 3
        assert row_after["reserved_quantity"] == reserved_before + 3
        nums = {b["batch_number"]: b["quantity"] for b in row_after["batches"]}
        assert T + "FE1" not in nums, "depleted batch should be pulled/zeroed"
        assert nums[T + "FE2"] == 19

        # cancel -> available + batch quantities restored
        r = admin.put(f"{API}/admin/orders/{order['id']}/status", json={"status": "cancelled"})
        assert r.status_code == 200, r.text
        tracker["orders"].remove(order["id"])
        row_c = _row(admin, ctx["pin"], pid)
        assert row_c["available_quantity"] == avail_before
        assert row_c["reserved_quantity"] == reserved_before
        nums_c = {b["batch_number"]: b["quantity"] for b in row_c["batches"]}
        assert nums_c.get(T + "FE1") == 2, f"earliest batch not restored: {nums_c}"
        assert nums_c.get(T + "FE2") == 20, f"later batch not restored: {nums_c}"
        # restored batch keeps its expiry so FEFO order is preserved
        restored = next(b for b in row_c["batches"] if b["batch_number"] == T + "FE1")
        assert restored["expiry_date"] == D_VSOON
        assert restored["expiry"]["status"] == "very_soon"
        # re-track for cleanup
        tracker["batches"].append(restored["id"])

    def test_order_cannot_oversell_available(self, admin, customer, ctx):
        pid = ctx["p_fefo"]["id"]
        row = _row(admin, ctx["pin"], pid)
        _clear_cart(customer, ctx["location_id"])
        r = customer.post(f"{API}/cart/items", json={
            "product_id": pid, "quantity": row["available_quantity"] + 5000,
            "location_id": ctx["location_id"]})
        if r.status_code == 200:
            r2 = _place_order(customer, ctx)
            assert r2.status_code in (400, 409), f"oversell allowed: {r2.status_code} {r2.text[:200]}"
        else:
            assert r.status_code in (400, 409), r.text
        _clear_cart(customer, ctx["location_id"])


# ---------- module: legacy rows without batches ----------
class TestLegacyNoBatches:
    def test_absolute_quantity_save_and_order_cycle(self, admin, customer, ctx, tracker):
        pid = ctx["p_legacy"]["id"]
        row = _row(admin, ctx["pin"], pid)
        assert not [b for b in (row.get("batches") or [])], "chosen legacy product already has batches"
        orig_avail, orig_th, orig_enabled = row["available_quantity"], row["low_stock_threshold"], row["enabled"]
        try:
            r = admin.put(f"{API}/admin/inventory", json={
                "product_id": pid, "pincode": ctx["pin"], "available_quantity": 25,
                "low_stock_threshold": 5, "enabled": True})
            assert r.status_code == 200, r.text
            row1 = _row(admin, ctx["pin"], pid)
            assert row1["available_quantity"] == 25
            assert row1["expiry_status"] == "none" and row1["nearest_expiry"] is None
            assert row1["batches"] == []

            _clear_cart(customer, ctx["location_id"])
            r = customer.post(f"{API}/cart/items", json={
                "product_id": pid, "quantity": 2, "location_id": ctx["location_id"]})
            assert r.status_code == 200, r.text
            r = _place_order(customer, ctx)
            assert r.status_code == 200, r.text
            order = r.json()
            tracker["orders"].append(order["id"])
            assert [a for a in (order.get("batch_allocations") or []) if a["product_id"] == pid] == []

            row2 = _row(admin, ctx["pin"], pid)
            assert row2["available_quantity"] == 23
            assert row2["reserved_quantity"] == row1["reserved_quantity"] + 2

            r = admin.put(f"{API}/admin/orders/{order['id']}/status", json={"status": "cancelled"})
            assert r.status_code == 200, r.text
            tracker["orders"].remove(order["id"])
            row3 = _row(admin, ctx["pin"], pid)
            assert row3["available_quantity"] == 25
            assert row3["reserved_quantity"] == row1["reserved_quantity"]
            assert row3["batches"] == []
        finally:
            admin.put(f"{API}/admin/inventory", json={
                "product_id": pid, "pincode": ctx["pin"], "available_quantity": orig_avail,
                "low_stock_threshold": orig_th, "enabled": orig_enabled})
            _clear_cart(customer, ctx["location_id"])


# ---------- module: existing PIN inventory regression ----------
class TestPinInventoryRegression:
    def test_listing_shape(self, admin, ctx):
        rows = admin.get(f"{API}/admin/inventory", params={"pincode": ctx["pin"]}).json()
        assert isinstance(rows, list) and rows
        r0 = rows[0]
        for k in ("product_id", "product_name", "enabled", "available_quantity",
                  "low_stock_threshold", "out_of_stock", "low_stock", "batches",
                  "expiry_status", "nearest_expiry", "expiry_days", "batch_count"):
            assert k in r0, f"missing {k}"
        assert all("_id" not in r for r in rows)

    def test_enable_disable_toggle(self, admin, ctx):
        pid = ctx["p_legacy"]["id"]
        row = _row(admin, ctx["pin"], pid)
        try:
            admin.put(f"{API}/admin/inventory", json={
                "product_id": pid, "pincode": ctx["pin"],
                "available_quantity": row["available_quantity"],
                "low_stock_threshold": row["low_stock_threshold"], "enabled": False})
            assert _row(admin, ctx["pin"], pid)["enabled"] is False
        finally:
            admin.put(f"{API}/admin/inventory", json={
                "product_id": pid, "pincode": ctx["pin"],
                "available_quantity": row["available_quantity"],
                "low_stock_threshold": row["low_stock_threshold"], "enabled": row["enabled"]})
            assert _row(admin, ctx["pin"], pid)["enabled"] == row["enabled"]

    def test_enable_all_this_pin(self, admin, ctx):
        r = admin.post(f"{API}/admin/inventory/enable-all", json={
            "pincodes": [ctx["pin"]], "enabled": True, "set_stock": None, "all_serviceable": False})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["rows_affected"] == d["products"] and d["pincodes"] == [ctx["pin"]]

    def test_summary_endpoint(self, admin, ctx):
        rows = admin.get(f"{API}/admin/inventory/summary").json()
        row = next((r for r in rows if r["pincode"] == ctx["pin"]), None)
        assert row and row["products_enabled"] >= 1
        assert row["low_stock"] >= 0 and row["out_of_stock"] >= 0
