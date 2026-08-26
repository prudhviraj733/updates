"""Iteration 21 - Coupon visibility/eligibility split, first-order-only, usage limits,
category-subtotal computation and server-side tamper-proofing (pytest)."""
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


# ---------------- session fixtures ----------------
@pytest.fixture(scope="session")
def admin():
    return _login(*ADMIN)


@pytest.fixture(scope="session")
def customer():
    return _login(*CUST)


@pytest.fixture(scope="session")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="session")
def store(customer, admin):
    """Pick a location/pincode with >=1 priced product plus its category."""
    locations = customer.get(f"{BASE}/locations").json()
    for L in locations:
        for pc in (L.get("pincodes") or []):
            r = customer.get(f"{BASE}/products", params={"pincode": pc, "location_id": L["id"]})
            if r.status_code != 200:
                continue
            data = r.json()
            prods = data if isinstance(data, list) else data.get("products", [])
            prods = [p for p in prods if (p.get("selling_price") or 0) > 0 and p.get("category_id")]
            if prods:
                cats = {c["id"]: c["name"] for c in customer.get(f"{BASE}/categories").json()}
                by_cat = {}
                for p in prods:
                    by_cat.setdefault(p["category_id"], []).append(p)
                # prefer a category with a product AND another product in a different category
                cat_id = next(iter(by_cat))
                other = next((p for p in prods if p["category_id"] != cat_id), None)
                return {"location_id": L["id"], "pincode": pc, "products": prods,
                        "cat_id": cat_id, "cat_name": cats.get(cat_id, ""),
                        "cat_product": by_cat[cat_id][0], "other_product": other}
    pytest.fail("No serviceable location/pincode with priced products found")


@pytest.fixture(scope="session")
def created_coupon_ids(admin):
    ids = []
    yield ids
    for cid in ids:
        admin.delete(f"{BASE}/admin/coupons/{cid}")


def mk_coupon(admin, created_coupon_ids, **kw):
    code = "IT21" + uuid.uuid4().hex[:6].upper()
    body = {"code": code, "coupon_type": "product", "discount_type": "fixed", "discount_value": 30,
            "min_order_value": 0, "is_active": True}
    body.update(kw)
    r = admin.post(f"{BASE}/admin/coupons", json=body)
    assert r.status_code == 200, r.text
    created_coupon_ids.append(r.json()["id"])
    return r.json()


# ---------------- Admin coupon persistence (new fields) ----------------
class TestAdminCouponFields:
    def test_create_with_new_fields_persists(self, admin, created_coupon_ids, store):
        c = mk_coupon(admin, created_coupon_ids, category_id=store["cat_id"], first_order_only=True,
                      usage_limit=5, usage_limit_per_customer=1, min_order_value=100)
        assert c["category_id"] == store["cat_id"]
        assert c["first_order_only"] is True
        assert c["usage_limit"] == 5 and c["usage_limit_per_customer"] == 1
        # GET verify persistence
        lst = admin.get(f"{BASE}/admin/coupons").json()
        got = next((x for x in lst if x["code"] == c["code"]), None)
        assert got is not None
        assert got["category_id"] == store["cat_id"] and got["first_order_only"] is True
        assert got["usage_limit"] == 5 and got["usage_limit_per_customer"] == 1
        assert "_id" not in got


# ---------------- Visibility vs application eligibility ----------------
class TestVisibilityVsEligibility:
    def test_general_min_order_coupon_visible_but_not_eligible(self, admin, customer, created_coupon_ids, store):
        c = mk_coupon(admin, created_coupon_ids, min_order_value=999999, discount_value=50)
        r = customer.get(f"{BASE}/coupons/available",
                         params={"location_id": store["location_id"], "subtotal": 100, "pincode": store["pincode"]})
        assert r.status_code == 200
        entry = next((x for x in r.json() if x["code"] == c["code"]), None)
        assert entry is not None, "general min-order coupon must still be VISIBLE"
        assert entry["eligible"] is False
        assert entry["state"] == "almost"
        assert "more" in entry["reason"].lower()
        assert entry["shortfall"] > 0

    def test_first_order_coupon_hidden_for_existing_customer(self, admin, customer, created_coupon_ids, store, mongo):
        me = customer.get(f"{BASE}/auth/me").json()
        uid = me.get("id")
        n = mongo.orders.count_documents({"user_id": uid, "status": {"$ne": "cancelled"}})
        assert n > 0, "seed customer@test.com is expected to have prior orders"
        c = mk_coupon(admin, created_coupon_ids, first_order_only=True)
        codes = [x["code"] for x in customer.get(f"{BASE}/coupons/available",
                 params={"location_id": store["location_id"], "subtotal": 500,
                         "pincode": store["pincode"]}).json()]
        assert c["code"] not in codes, "first-order-only coupon must be hidden from returning customer"

    def test_first_order_coupon_rejected_for_existing_customer(self, admin, customer, created_coupon_ids, store):
        c = mk_coupon(admin, created_coupon_ids, first_order_only=True)
        r = customer.post(f"{BASE}/coupons/validate", json={
            "code": c["code"], "location_id": store["location_id"], "subtotal": 1000})
        assert r.status_code == 400, r.text
        assert "first order" in r.json()["detail"].lower()

    def test_expired_coupon_hidden_and_rejected(self, admin, customer, created_coupon_ids, store):
        c = mk_coupon(admin, created_coupon_ids, end_date="2020-01-01")
        codes = [x["code"] for x in customer.get(f"{BASE}/coupons/available",
                 params={"location_id": store["location_id"], "subtotal": 500,
                         "pincode": store["pincode"]}).json()]
        assert c["code"] not in codes
        r = customer.post(f"{BASE}/coupons/validate", json={
            "code": c["code"], "location_id": store["location_id"], "subtotal": 1000})
        assert r.status_code == 400 and "expired" in r.json()["detail"].lower()

    def test_available_requires_auth(self, store):
        r = requests.get(f"{BASE}/coupons/available", params={"location_id": store["location_id"]})
        assert r.status_code in (401, 403), r.status_code


# ---------------- Category subtotal + tamper proofing ----------------
class TestCategoryAndTamper:
    @pytest.fixture(autouse=True)
    def clean_cart(self, customer, store):
        customer.delete(f"{BASE}/cart", params={"location_id": store["location_id"]})
        yield
        customer.delete(f"{BASE}/cart", params={"location_id": store["location_id"]})

    def _add(self, customer, store, product, qty=1):
        r = customer.post(f"{BASE}/cart/items", json={"product_id": product["id"],
                                                      "location_id": store["location_id"],
                                                      "pincode": store["pincode"], "quantity": qty})
        assert r.status_code == 200, r.text
        return r.json()

    def test_category_discount_uses_category_subtotal_not_tampered_subtotal(self, admin, customer,
                                                                           created_coupon_ids, store):
        cp = store["cat_product"]
        self._add(customer, store, cp, 1)
        if store["other_product"]:
            self._add(customer, store, store["other_product"], 1)
        cat_sub = cp["selling_price"]
        c = mk_coupon(admin, created_coupon_ids, category_id=store["cat_id"],
                      discount_type="percentage", discount_value=10, min_order_value=0)
        # tampered huge subtotal
        r = customer.post(f"{BASE}/coupons/validate", json={
            "code": c["code"], "location_id": store["location_id"], "subtotal": 9999999})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["category_subtotal"] == pytest.approx(round(cat_sub, 2), abs=0.02), d
        assert d["discount"] == pytest.approx(round(cat_sub * 0.1, 2), abs=0.02), d

    def test_category_coupon_below_min_rejected_with_shortfall_message(self, admin, customer,
                                                                      created_coupon_ids, store):
        cp = store["cat_product"]
        self._add(customer, store, cp, 1)
        min_req = cp["selling_price"] + 500
        c = mk_coupon(admin, created_coupon_ids, category_id=store["cat_id"], min_order_value=min_req)
        r = customer.post(f"{BASE}/coupons/validate", json={
            "code": c["code"], "location_id": store["location_id"], "subtotal": 9999999})
        assert r.status_code == 400
        detail = r.json()["detail"]
        assert "more" in detail.lower() and "invalid" not in detail.lower()
        # available list should mark it almost-eligible with shortfall + category name
        entry = next(x for x in customer.get(f"{BASE}/coupons/available", params={
            "location_id": store["location_id"], "subtotal": 9999999,
            "pincode": store["pincode"]}).json() if x["code"] == c["code"])
        assert entry["eligible"] is False and entry["shortfall"] == pytest.approx(500, abs=1)
        assert entry["category_id"] == store["cat_id"] and entry["category_name"]

    def test_general_coupon_regression(self, admin, customer, created_coupon_ids, store):
        cp = store["cat_product"]
        self._add(customer, store, cp, 1)
        cart = customer.get(f"{BASE}/cart", params={"location_id": store["location_id"]}).json()
        sub = cart["subtotal"]
        c = mk_coupon(admin, created_coupon_ids, discount_type="fixed", discount_value=20, min_order_value=0)
        r = customer.post(f"{BASE}/coupons/validate", json={
            "code": c["code"], "location_id": store["location_id"], "subtotal": sub})
        assert r.status_code == 200, r.text
        assert r.json()["discount"] == 20


# ---------------- New customer end-to-end (first-order coupon + real COD order) ----------------
class TestNewCustomerE2E:
    @pytest.fixture(scope="class")
    def new_customer(self, mongo):
        email = f"it21_{uuid.uuid4().hex[:8]}@test.com"
        s = requests.Session()
        r = s.post(f"{BASE}/auth/register", json={"name": "IT21 Tester", "email": email,
                                                  "phone": "9876500123", "password": "Test@12345"})
        assert r.status_code in (200, 201), r.text
        yield {"session": s, "email": email}
        u = mongo.users.find_one({"email": email})
        if u:
            uid = str(u["_id"])
            mongo.orders.delete_many({"user_id": uid})
            mongo.carts.delete_many({"user_id": uid})
            mongo.addresses.delete_many({"user_id": uid})
            mongo.users.delete_one({"_id": u["_id"]})

    def test_new_customer_sees_and_applies_first_order_coupon(self, admin, new_customer,
                                                              created_coupon_ids, store):
        s = new_customer["session"]
        # subtotal is now server-derived, so the cart must actually hold items
        s.delete(f"{BASE}/cart", params={"location_id": store["location_id"]})
        s.post(f"{BASE}/cart/items", json={"product_id": store["cat_product"]["id"],
                                           "location_id": store["location_id"],
                                           "pincode": store["pincode"], "quantity": 1})
        c = mk_coupon(admin, created_coupon_ids, first_order_only=True, discount_type="fixed",
                      discount_value=40, min_order_value=0)
        codes = [x["code"] for x in s.get(f"{BASE}/coupons/available", params={
            "location_id": store["location_id"], "subtotal": 500, "pincode": store["pincode"]}).json()]
        assert c["code"] in codes, "brand-new customer must see first-order-only coupon"
        r = s.post(f"{BASE}/coupons/validate", json={"code": c["code"],
                                                     "location_id": store["location_id"], "subtotal": 500})
        assert r.status_code == 200, r.text
        assert r.json()["discount"] == 40

    def test_place_cod_order_with_category_coupon_matches_server_calc(self, admin, new_customer,
                                                                     created_coupon_ids, store, mongo):
        s = new_customer["session"]
        cp = store["cat_product"]
        s.delete(f"{BASE}/cart", params={"location_id": store["location_id"]})
        add = s.post(f"{BASE}/cart/items", json={"product_id": cp["id"], "location_id": store["location_id"],
                                                 "pincode": store["pincode"], "quantity": 1})
        assert add.status_code == 200, add.text
        if store["other_product"]:
            s.post(f"{BASE}/cart/items", json={"product_id": store["other_product"]["id"],
                                               "location_id": store["location_id"],
                                               "pincode": store["pincode"], "quantity": 1})
        cart = s.get(f"{BASE}/cart", params={"location_id": store["location_id"]}).json()
        cat_sub = sum(i["line_total"] for i in cart["items"] if i.get("product_id") == cp["id"])

        c = mk_coupon(admin, created_coupon_ids, category_id=store["cat_id"],
                      discount_type="percentage", discount_value=10, min_order_value=0)

        addr = s.post(f"{BASE}/addresses", json={"label": "Home", "full_name": "IT21 Tester",
                                                 "phone": "9876500123", "line1": "1 Test St", "city": "Test",
                                                 "pincode": store["pincode"], "location_id": store["location_id"],
                                                 "is_default": True})
        assert addr.status_code == 200, addr.text
        address_id = addr.json()["id"]

        slots = s.get(f"{BASE}/delivery/slots/range", params={"location_id": store["location_id"], "days": 4}).json()
        slot_id = None
        for d in slots.get("days", []):
            for sl in d["slots"]:
                if sl["available"]:
                    slot_id = sl["id"]
                    break
            if slot_id:
                break
        assert slot_id, "no available delivery slot"

        r = s.post(f"{BASE}/orders", json={"location_id": store["location_id"], "address_id": address_id,
                                           "delivery_type": "slot", "slot_id": slot_id,
                                           "payment_method": "cod", "coupon_code": c["code"]})
        assert r.status_code == 200, r.text
        order = r.json()
        assert "_id" not in order
        expected = round(cat_sub * 0.1, 2)
        assert order["coupon_discount"] == pytest.approx(expected, abs=0.05), \
            f"expected category-based discount {expected}, got {order['coupon_discount']} (cart subtotal {cart['subtotal']})"
        assert order["coupon_code"] == c["code"]
        # persistence check
        got = s.get(f"{BASE}/orders/{order['id']}").json()
        assert got["coupon_discount"] == pytest.approx(expected, abs=0.05)
        # cleanup: cancel order via admin API to release inventory
        admin.put(f"{BASE}/admin/orders/{order['id']}/status", json={"status": "cancelled"})

    def test_first_order_coupon_rejected_after_order_exists(self, admin, new_customer,
                                                            created_coupon_ids, store, mongo):
        """After the customer has a non-cancelled order the first-order coupon must be hidden+rejected."""
        s = new_customer["session"]
        u = mongo.users.find_one({"email": new_customer["email"]})
        uid = str(u["_id"])
        mongo.orders.insert_one({"id": str(uuid.uuid4()), "order_number": "IT21" + uuid.uuid4().hex[:5],
                                 "user_id": uid, "location_id": store["location_id"], "status": "delivered",
                                 "items": [], "final_amount": 100, "created_at": "2026-01-01T00:00:00"})
        c = mk_coupon(admin, created_coupon_ids, first_order_only=True, discount_value=40)
        codes = [x["code"] for x in s.get(f"{BASE}/coupons/available", params={
            "location_id": store["location_id"], "subtotal": 500, "pincode": store["pincode"]}).json()]
        assert c["code"] not in codes
        r = s.post(f"{BASE}/coupons/validate", json={"code": c["code"],
                                                     "location_id": store["location_id"], "subtotal": 500})
        assert r.status_code == 400 and "first order" in r.json()["detail"].lower()


# ---------------- Usage limits ----------------
class TestUsageLimits:
    def test_global_and_per_customer_limits_hidden_and_rejected(self, admin, customer, created_coupon_ids,
                                                               store, mongo):
        me = customer.get(f"{BASE}/auth/me").json()
        uid = me["id"]
        glob = mk_coupon(admin, created_coupon_ids, usage_limit=1)
        perc = mk_coupon(admin, created_coupon_ids, usage_limit_per_customer=1)
        fake_ids = []
        for code in (glob["code"], perc["code"]):
            oid = str(uuid.uuid4())
            mongo.orders.insert_one({"id": oid, "order_number": "IT21U" + uuid.uuid4().hex[:5],
                                     "user_id": uid, "location_id": store["location_id"],
                                     "status": "delivered", "items": [], "coupon_code": code,
                                     "final_amount": 100, "created_at": "2026-01-01T00:00:00"})
            fake_ids.append(oid)
        try:
            codes = [x["code"] for x in customer.get(f"{BASE}/coupons/available", params={
                "location_id": store["location_id"], "subtotal": 500, "pincode": store["pincode"]}).json()]
            assert glob["code"] not in codes
            assert perc["code"] not in codes
            for code, frag in ((glob["code"], "usage limit"), (perc["code"], "already used")):
                r = customer.post(f"{BASE}/coupons/validate", json={
                    "code": code, "location_id": store["location_id"], "subtotal": 500})
                assert r.status_code == 400, r.text
                assert frag in r.json()["detail"].lower(), r.json()
        finally:
            mongo.orders.delete_many({"id": {"$in": fake_ids}})
