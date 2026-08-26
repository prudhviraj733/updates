"""Iteration 22 re-test: server-derived cart subtotal in /coupons/available and /coupons/validate.
Confirms the fix for the iteration_20 HIGH bug (client `subtotal` param must be IGNORED)."""
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE = base_url.rstrip("/") + "/api"

backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = backend_env.get("MONGO_URL")
DB_NAME = backend_env.get("DB_NAME")

ADMIN = ("prudhvirajm847@gmail.com", "Admin@12345")
CUST = ("customer@test.com", "Test@12345")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.fail(f"login failed {email}: {r.status_code} {r.text[:300]}")
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def customer():
    return _login(*CUST)


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="module")
def store(customer):
    locations = customer.get(f"{BASE}/locations").json()
    for L in locations:
        for pc in (L.get("pincodes") or []):
            r = customer.get(f"{BASE}/products", params={"pincode": pc, "location_id": L["id"]})
            if r.status_code != 200:
                continue
            data = r.json()
            prods = data if isinstance(data, list) else data.get("products", [])
            prods = [p for p in prods if (p.get("selling_price") or 0) > 0 and p.get("category_id")]
            if not prods:
                continue
            prods.sort(key=lambda p: -p["selling_price"])
            main = prods[0]
            other = next((p for p in prods if p["category_id"] != main["category_id"]), None)
            return {"location_id": L["id"], "pincode": pc, "main": main, "other": other}
    pytest.fail("No serviceable location with priced products")


@pytest.fixture(scope="module")
def coupon_ids(admin):
    ids = []
    yield ids
    for cid in ids:
        admin.delete(f"{BASE}/admin/coupons/{cid}")


def mk_coupon(admin, coupon_ids, **kw):
    code = "IT22" + uuid.uuid4().hex[:6].upper()
    body = {"code": code, "coupon_type": "product", "discount_type": "fixed", "discount_value": 30,
            "min_order_value": 0, "is_active": True}
    body.update(kw)
    r = admin.post(f"{BASE}/admin/coupons", json=body)
    assert r.status_code == 200, r.text
    coupon_ids.append(r.json()["id"])
    return r.json()


@pytest.fixture
def cart(customer, store):
    """Fresh cart with the main product; returns server cart subtotal."""
    customer.delete(f"{BASE}/cart", params={"location_id": store["location_id"]})
    r = customer.post(f"{BASE}/cart/items", json={"product_id": store["main"]["id"],
                                                  "location_id": store["location_id"],
                                                  "pincode": store["pincode"], "quantity": 2})
    assert r.status_code == 200, r.text
    c = customer.get(f"{BASE}/cart", params={"location_id": store["location_id"]}).json()
    yield c
    customer.delete(f"{BASE}/cart", params={"location_id": store["location_id"]})


# ---- PRIMARY: /coupons/available ignores client subtotal (the iteration_20 HIGH bug) ----
class TestAvailableServerSubtotal:
    def test_general_coupon_eligible_even_when_client_sends_subtotal_zero(self, admin, customer,
                                                                         coupon_ids, store, cart):
        sub = cart["subtotal"]
        assert sub > 300, f"need a cart > 300 for this test, got {sub}"
        c = mk_coupon(admin, coupon_ids, min_order_value=299, discount_type="percentage",
                      discount_value=10, max_discount=100)
        r = customer.get(f"{BASE}/coupons/available", params={
            "location_id": store["location_id"], "subtotal": 0, "pincode": store["pincode"]})
        assert r.status_code == 200, r.text
        entry = next((x for x in r.json() if x["code"] == c["code"]), None)
        assert entry is not None, "coupon must be visible"
        assert entry["eligible"] is True, f"stale subtotal=0 must be ignored, got {entry}"
        assert entry["state"] == "available"
        assert entry["reason"] == ""
        assert entry["shortfall"] == 0

    def test_general_coupon_not_eligible_reflects_real_cart_shortfall(self, admin, customer,
                                                                     coupon_ids, store, cart):
        sub = cart["subtotal"]
        c = mk_coupon(admin, coupon_ids, min_order_value=sub + 250)
        # tampered huge subtotal must NOT make it eligible
        entry = next(x for x in customer.get(f"{BASE}/coupons/available", params={
            "location_id": store["location_id"], "subtotal": 999999,
            "pincode": store["pincode"]}).json() if x["code"] == c["code"])
        assert entry["eligible"] is False, entry
        assert entry["shortfall"] == pytest.approx(250, abs=1), entry
        assert "more" in entry["reason"].lower()

    def test_category_shortfall_uses_only_category_subtotal(self, admin, customer, coupon_ids, store, cart):
        """Mixed cart: category coupon eligibility uses that category's subtotal only."""
        if not store["other"]:
            pytest.skip("no second-category product available")
        customer.post(f"{BASE}/cart/items", json={"product_id": store["other"]["id"],
                                                  "location_id": store["location_id"],
                                                  "pincode": store["pincode"], "quantity": 1})
        cat_sub = store["other"]["selling_price"]
        c = mk_coupon(admin, coupon_ids, category_id=store["other"]["category_id"],
                      min_order_value=cat_sub + 300)
        entry = next(x for x in customer.get(f"{BASE}/coupons/available", params={
            "location_id": store["location_id"], "subtotal": 999999,
            "pincode": store["pincode"]}).json() if x["code"] == c["code"])
        assert entry["eligible"] is False, entry
        assert entry["shortfall"] == pytest.approx(300, abs=1), entry
        assert entry["category_id"] == store["other"]["category_id"]
        assert entry["category_name"]


# ---- Tamper proofing on validate ----
class TestValidateTamperProof:
    def test_general_percentage_discount_from_server_cart(self, admin, customer, coupon_ids, store, cart):
        sub = cart["subtotal"]
        c = mk_coupon(admin, coupon_ids, discount_type="percentage", discount_value=10,
                      min_order_value=0, max_discount=100000)
        r = customer.post(f"{BASE}/coupons/validate", json={
            "code": c["code"], "location_id": store["location_id"], "subtotal": 999999})
        assert r.status_code == 200, r.text
        assert r.json()["discount"] == pytest.approx(round(sub * 0.1, 2), abs=0.05), \
            f"discount must come from real cart subtotal {sub}, got {r.json()}"

    def test_general_min_order_not_bypassable_by_tampered_subtotal(self, admin, customer, coupon_ids,
                                                                   store, cart):
        c = mk_coupon(admin, coupon_ids, min_order_value=cart["subtotal"] + 500)
        r = customer.post(f"{BASE}/coupons/validate", json={
            "code": c["code"], "location_id": store["location_id"], "subtotal": 999999})
        assert r.status_code == 400, r.text
        assert "more" in r.json()["detail"].lower()

    def test_category_discount_from_server_category_subtotal(self, admin, customer, coupon_ids, store, cart):
        cat_sub = store["main"]["selling_price"] * 2
        c = mk_coupon(admin, coupon_ids, category_id=store["main"]["category_id"],
                      discount_type="percentage", discount_value=10, min_order_value=0,
                      max_discount=100000)
        r = customer.post(f"{BASE}/coupons/validate", json={
            "code": c["code"], "location_id": store["location_id"], "subtotal": 999999})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["category_subtotal"] == pytest.approx(cat_sub, abs=0.05), d
        assert d["discount"] == pytest.approx(round(cat_sub * 0.1, 2), abs=0.05), d


# ---- End-to-end order regression with a general coupon ----
class TestOrderRegression:
    def test_cod_order_with_general_percentage_coupon(self, admin, customer, coupon_ids, store, cart, mongo):
        sub = cart["subtotal"]
        c = mk_coupon(admin, coupon_ids, discount_type="percentage", discount_value=10,
                      min_order_value=0, max_discount=100000)
        addrs = customer.get(f"{BASE}/addresses").json()
        addr = next((a for a in addrs if a.get("pincode") == store["pincode"]), None)
        if not addr:
            pytest.skip(f"customer has no address for pincode {store['pincode']}")
        slots = customer.get(f"{BASE}/delivery/slots/range",
                             params={"location_id": store["location_id"], "days": 4}).json()
        slot_id = next((sl["id"] for d in slots.get("days", []) for sl in d["slots"] if sl["available"]), None)
        assert slot_id, "no available delivery slot"
        r = customer.post(f"{BASE}/orders", json={"location_id": store["location_id"],
                                                  "address_id": addr["id"], "delivery_type": "slot",
                                                  "slot_id": slot_id, "payment_method": "cod",
                                                  "coupon_code": c["code"]})
        assert r.status_code == 200, r.text
        order = r.json()
        assert "_id" not in order
        assert order["coupon_code"] == c["code"]
        assert order["coupon_discount"] == pytest.approx(round(sub * 0.1, 2), abs=0.05), order
        got = customer.get(f"{BASE}/orders/{order['id']}").json()
        assert got["coupon_discount"] == pytest.approx(round(sub * 0.1, 2), abs=0.05)
        # cleanup via admin API so reserved inventory is released
        cx = admin.put(f"{BASE}/admin/orders/{order['id']}/status", json={"status": "cancelled"})
        assert cx.status_code == 200, cx.text


# ---- Empty cart behaviour ----
class TestEmptyCart:
    def test_validate_general_coupon_on_empty_cart(self, admin, customer, coupon_ids, store):
        customer.delete(f"{BASE}/cart", params={"location_id": store["location_id"]})
        c = mk_coupon(admin, coupon_ids, discount_type="fixed", discount_value=40, min_order_value=0)
        r = customer.post(f"{BASE}/coupons/validate", json={
            "code": c["code"], "location_id": store["location_id"], "subtotal": 500})
        # Expected: reject (or at least never a positive discount)
        assert r.status_code != 200 or r.json()["discount"] == 0, r.text
