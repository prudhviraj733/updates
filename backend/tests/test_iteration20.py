"""Iteration 20 full regression: auth hardening, products, cart, checkout (normal +
30-min express per PIN), orders, admin, notification center, SEO.

Runs against the public preview URL from /app/frontend/.env.
"""
import os
import re
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

CREDS_PATH = Path("/app/memory/test_credentials.md")


def _creds():
    content = CREDS_PATH.read_text(encoding="utf-8")
    emails = re.findall(r"(?im)^\s*[-*]?\s*Email:\s*`?([^`\s]+)", content)
    pwds = re.findall(r"(?im)^\s*[-*]?\s*Password:\s*`?([^`\s]+)", content)
    return emails, pwds


@pytest.fixture(scope="session")
def admin_creds():
    if not CREDS_PATH.exists():
        pytest.skip("missing test_credentials.md")
    emails, pwds = _creds()
    return {"email": emails[0], "password": pwds[0]}


@pytest.fixture(scope="session")
def customer_creds():
    emails, pwds = _creds()
    return {"email": emails[1], "password": pwds[1]}


def _session(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed for {email}: {r.status_code} {r.text[:300]}")
    return s, r


@pytest.fixture(scope="session")
def admin(admin_creds):
    s, r = _session(admin_creds["email"], admin_creds["password"])
    assert r.json()["role"] == "admin"
    return s


@pytest.fixture(scope="session")
def cust(customer_creds):
    s, r = _session(customer_creds["email"], customer_creds["password"])
    assert r.json()["role"] == "customer"
    s.user = r.json()
    return s


@pytest.fixture(scope="session")
def location_id():
    r = requests.get(f"{API}/locations", timeout=30)
    assert r.status_code == 200, r.text
    locs = r.json()
    assert locs, "no locations seeded"
    return locs[0]["id"]


# ==================== Health ====================
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=30)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ==================== Auth ====================
class TestAuth:
    def test_admin_login_sets_httponly_cookies(self, admin_creds):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json=admin_creds, timeout=30)
        assert r.status_code == 200, r.text
        raw = "; ".join(r.headers.get_all("set-cookie")) if hasattr(r.headers, "get_all") \
            else r.headers.get("set-cookie", "")
        assert "access_token" in raw and "refresh_token" in raw
        assert raw.lower().count("httponly") >= 2
        assert "access_token" in s.cookies and "refresh_token" in s.cookies
        me = s.get(f"{API}/auth/me", timeout=30)
        assert me.status_code == 200
        assert me.json()["role"] == "admin"
        assert "password_hash" not in me.json()
        assert "_id" not in me.json()

    def test_register_new_customer_and_relogin(self):
        ts = int(time.time())
        email = f"TEST_qa{ts}@example.com"
        payload = {"name": "TEST QA User", "email": email,
                   "phone": "9876500000", "password": "Test@12345"}
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == email.lower()
        assert data["role"] == "customer"
        assert "access_token" in s.cookies  # auto-logged-in
        me = s.get(f"{API}/auth/me", timeout=30)
        assert me.status_code == 200 and me.json()["email"] == email.lower()

        # re-login with same creds
        s2 = requests.Session()
        r2 = s2.post(f"{API}/auth/login", json={"email": email, "password": "Test@12345"}, timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.json()["id"] == data["id"]
        TestAuth.registered_email = email

    def test_duplicate_registration_rejected(self):
        email = getattr(TestAuth, "registered_email", None)
        if not email:
            pytest.skip("registration test did not run")
        r = requests.post(f"{API}/auth/register", json={
            "name": "dup", "email": email, "phone": "9876500000", "password": "Test@12345"}, timeout=30)
        assert r.status_code == 400
        assert "already registered" in r.json()["detail"].lower()

    def test_short_password_validation(self):
        r = requests.post(f"{API}/auth/register", json={
            "name": "x", "email": f"TEST_short{int(time.time())}@example.com",
            "phone": "9876500000", "password": "123"}, timeout=30)
        assert r.status_code == 422, r.text
        assert "detail" in r.json()

    def test_bad_email_validation(self):
        r = requests.post(f"{API}/auth/register", json={
            "name": "x", "email": "not-an-email", "phone": "9876500000",
            "password": "Test@12345"}, timeout=30)
        assert r.status_code == 422

    def test_wrong_password_message(self, customer_creds):
        r = requests.post(f"{API}/auth/login", json={
            "email": customer_creds["email"], "password": "definitely-wrong-1"}, timeout=30)
        assert r.status_code == 401, r.text
        assert r.json()["detail"] == "Invalid email or password"
        # correct password must still work right after a single failure
        r2 = requests.post(f"{API}/auth/login", json=customer_creds, timeout=30)
        assert r2.status_code == 200, f"legit login blocked after 1 failure: {r2.text[:300]}"

    def test_lockout_after_five_failures(self):
        """Rolling-window lockout on a throwaway account (does not touch real users)."""
        ts = int(time.time())
        email = f"TEST_lock{ts}@example.com"
        assert requests.post(f"{API}/auth/register", json={
            "name": "TEST Lock", "email": email, "phone": "9876500001",
            "password": "Test@12345"}, timeout=30).status_code == 200
        codes = []
        for _ in range(5):
            codes.append(requests.post(f"{API}/auth/login", json={
                "email": email, "password": "bad-pass"}, timeout=30).status_code)
        assert codes[:4] == [401] * 4, codes
        assert codes[4] == 429, codes
        # even with the right password the account is now temporarily locked
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "Test@12345"}, timeout=30)
        assert r.status_code == 429
        assert "try again in" in r.json()["detail"].lower()

    def test_bcrypt_hash_format(self):
        import asyncio
        import sys
        sys.path.insert(0, "/app/backend")
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        from motor.motor_asyncio import AsyncIOMotorClient

        async def _check():
            c = AsyncIOMotorClient(os.environ["MONGO_URL"])
            u = await c[os.environ["DB_NAME"]].users.find_one({"role": "admin"})
            c.close()
            return u
        u = asyncio.get_event_loop().run_until_complete(_check()) if False else asyncio.run(_check())
        assert u is not None
        assert u["password_hash"].startswith("$2b$"), u["password_hash"][:10]

    def test_cors_allows_credentials_explicit_origin(self):
        """The preview edge proxy answers OPTIONS itself with '*', so verify the
        app-level CORS middleware directly on the internal app port."""
        r = requests.options("http://localhost:8001/api/auth/login", headers={
            "Origin": BASE_URL, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type"}, timeout=30)
        assert r.status_code in (200, 204), r.status_code
        assert r.headers.get("access-control-allow-credentials") == "true", dict(r.headers)
        origin = r.headers.get("access-control-allow-origin")
        assert origin != "*", "wildcard origin cannot be combined with credentials"
        assert origin == BASE_URL, origin

    def test_unauthenticated_protected_endpoint(self):
        assert requests.get(f"{API}/auth/me", timeout=30).status_code == 401
        assert requests.get(f"{API}/admin/orders", timeout=30).status_code == 401

    def test_customer_cannot_access_admin(self, cust):
        assert cust.get(f"{API}/admin/orders", timeout=30).status_code == 403


# ==================== Products / catalog ====================
class TestCatalog:
    def test_categories(self):
        r = requests.get(f"{API}/categories", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 0
        assert "_id" not in r.json()[0]

    def test_combo_banners(self):
        r = requests.get(f"{API}/combo-banners", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_products_list_and_filters(self, location_id):
        r = requests.get(f"{API}/products", params={"location_id": location_id}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        items = body["products"] if isinstance(body, dict) else body
        assert len(items) > 0
        p = items[0]
        for key in ("id", "name", "selling_price"):
            assert key in p
        assert "_id" not in p

        # search
        term = p["name"].split()[0]
        rs = requests.get(f"{API}/products", params={"location_id": location_id, "search": term}, timeout=30)
        assert rs.status_code == 200
        sitems = rs.json()["products"] if isinstance(rs.json(), dict) else rs.json()
        assert any(term.lower() in i["name"].lower() for i in sitems)

        # in stock + price filters
        rf = requests.get(f"{API}/products", params={
            "location_id": location_id, "in_stock": "true", "max_price": 1000}, timeout=30)
        assert rf.status_code == 200
        fitems = rf.json()["products"] if isinstance(rf.json(), dict) else rf.json()
        assert all(i["selling_price"] <= 1000 for i in fitems)

        # category filter
        rc = requests.get(f"{API}/products", params={
            "location_id": location_id, "category_id": p.get("category_id")}, timeout=30)
        assert rc.status_code == 200

    def test_product_detail(self, location_id):
        body = requests.get(f"{API}/products", params={"location_id": location_id}, timeout=30).json()
        items = body["products"] if isinstance(body, dict) else body
        pid = items[0]["id"]
        r = requests.get(f"{API}/products/{pid}", params={"location_id": location_id}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] == pid
        assert "selling_price" in d

    def test_product_detail_404(self, location_id):
        r = requests.get(f"{API}/products/does-not-exist",
                         params={"location_id": location_id}, timeout=30)
        assert r.status_code == 404


# ==================== PIN codes / delivery ====================
class TestPinCodes:
    @pytest.mark.parametrize("pin,normal,express_enabled,express_charge", [
        ("520003", 60, True, 100),
        ("520004", 40, True, 100),
        ("520005", 40, False, 0),
    ])
    def test_pin_check(self, pin, normal, express_enabled, express_charge):
        r = requests.get(f"{API}/pincodes/check", params={"pincode": pin}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["serviceable"] is True, d
        assert d["delivery_charge"] == normal, d
        assert d["express_enabled"] == express_enabled, d
        if express_enabled:
            assert d["express_charge"] == express_charge, d

    def test_unserviceable_pin(self):
        r = requests.get(f"{API}/pincodes/check", params={"pincode": "999999"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["serviceable"] is False

    def test_admin_pincodes_list(self, admin):
        r = admin.get(f"{API}/admin/pincodes", timeout=30)
        assert r.status_code == 200
        pins = {p["pincode"]: p for p in r.json()}
        assert "520004" in pins
        assert pins["520004"].get("express_enabled") is True
        assert pins["520005"].get("express_enabled") in (False, None)

    def test_delivery_settings_and_slots(self, location_id):
        r = requests.get(f"{API}/delivery/settings", params={"location_id": location_id}, timeout=30)
        assert r.status_code == 200, r.text
        rr = requests.get(f"{API}/delivery/slots/range",
                          params={"location_id": location_id, "days": 2}, timeout=30)
        assert rr.status_code == 200, rr.text
        assert rr.json()["days"], rr.text
        day = rr.json()["days"][0]["date"]
        r2 = requests.get(f"{API}/delivery/slots",
                          params={"location_id": location_id, "date": day}, timeout=30)
        assert r2.status_code == 200, r2.text
        assert "slots" in r2.json()


# ==================== Cart + Checkout + Orders ====================
class TestCheckoutAndOrders:
    created_orders = []
    created_addresses = []

    @staticmethod
    def _address(cust, location_id, pincode, label):
        r = cust.post(f"{API}/addresses", json={
            "label": label, "full_name": "TEST QA", "phone": "9876500002",
            "line1": "TEST 1 QA Street", "city": "Vijayawada", "area": "QA",
            "pincode": pincode, "location_id": location_id}, timeout=30)
        assert r.status_code in (200, 201), r.text
        addr = r.json()
        aid = addr.get("id") or addr.get("address", {}).get("id")
        TestCheckoutAndOrders.created_addresses.append(aid)
        return aid

    @staticmethod
    def _fill_cart(cust, location_id, pincode, qty=2):
        cust.delete(f"{API}/cart", params={"location_id": location_id}, timeout=30)
        body = requests.get(f"{API}/products", params={
            "location_id": location_id, "in_stock": "true", "pincode": pincode}, timeout=30).json()
        items = body["products"] if isinstance(body, dict) else body
        prod = items[0]
        r = cust.post(f"{API}/cart/items", json={
            "product_id": prod["id"], "quantity": qty,
            "location_id": location_id, "pincode": pincode}, timeout=30)
        assert r.status_code == 200, r.text
        return prod, r.json()

    def test_cart_crud_and_persistence(self, cust, location_id):
        prod, cart = self._fill_cart(cust, location_id, "520004", qty=2)
        assert cart["count"] >= 1
        expected = round(prod["selling_price"] * 2, 2)
        assert abs(cart["subtotal"] - expected) < 0.01, (cart["subtotal"], expected)

        # update quantity
        r = cust.put(f"{API}/cart/items/{prod['id']}", json={
            "quantity": 3, "location_id": location_id, "pincode": "520004"}, timeout=30)
        assert r.status_code == 200, r.text
        assert abs(r.json()["subtotal"] - round(prod["selling_price"] * 3, 2)) < 0.01

        # persistence via fresh GET
        g = cust.get(f"{API}/cart", params={"location_id": location_id, "pincode": "520004"}, timeout=30)
        assert g.status_code == 200
        line = next(i for i in g.json()["items"] if i["product_id"] == prod["id"])
        assert line["quantity"] == 3

        # remove
        d = cust.delete(f"{API}/cart/items/{prod['id']}",
                        params={"location_id": location_id, "pincode": "520004"}, timeout=30)
        assert d.status_code == 200
        assert all(i["product_id"] != prod["id"] for i in d.json()["items"])

    def test_over_stock_add_rejected(self, cust, location_id):
        body = requests.get(f"{API}/products", params={
            "location_id": location_id, "in_stock": "true", "pincode": "520004"}, timeout=30).json()
        items = body["products"] if isinstance(body, dict) else body
        pid = items[0]["id"]
        r = cust.post(f"{API}/cart/items", json={
            "product_id": pid, "quantity": 100000,
            "location_id": location_id, "pincode": "520004"}, timeout=30)
        assert r.status_code == 409, r.text
        cust.delete(f"{API}/cart", params={"location_id": location_id}, timeout=30)

    def test_empty_cart_order_rejected(self, cust, location_id):
        aid = self._address(cust, location_id, "520004", "TEST_Empty")
        cust.delete(f"{API}/cart", params={"location_id": location_id}, timeout=30)
        r = cust.post(f"{API}/orders", json={
            "location_id": location_id, "address_id": aid,
            "delivery_type": "express", "payment_method": "cod"}, timeout=30)
        assert r.status_code == 400
        assert "cart is empty" in r.json()["detail"].lower()

    def test_normal_slot_order_math_520004(self, cust, location_id):
        prod, cart = self._fill_cart(cust, location_id, "520004", qty=2)
        subtotal = cart["subtotal"]
        aid = self._address(cust, location_id, "520004", "TEST_Slot")
        days = requests.get(f"{API}/delivery/slots/range",
                            params={"location_id": location_id, "days": 3}, timeout=30).json()["days"]
        slot = next((s for d in days for s in d["slots"] if s["available"]), None)
        assert slot, "no available slot"
        r = cust.post(f"{API}/orders", json={
            "location_id": location_id, "address_id": aid, "delivery_type": "slot",
            "slot_id": slot["id"], "payment_method": "cod"}, timeout=30)
        assert r.status_code == 200, r.text
        o = r.json()
        TestCheckoutAndOrders.created_orders.append(o["id"])
        assert o["delivery_type"] == "slot"
        assert o["slot_label"] == slot["label"]
        assert o["express_charge"] == 0
        if not o["free_delivery_applied"]:
            assert o["delivery_charge"] == 40, o["delivery_charge"]
        assert abs(o["final_amount"] - round(subtotal - o["coupon_discount"] + o["delivery_charge"]
                                            + o["express_charge"] - o["delivery_discount"], 2)) < 0.01
        assert o["status"] == "pending"
        assert o["is_express"] is False
        # cart cleared
        g = cust.get(f"{API}/cart", params={"location_id": location_id, "pincode": "520004"}, timeout=30)
        assert g.json()["count"] == 0

    def test_slot_required_for_normal(self, cust, location_id):
        self._fill_cart(cust, location_id, "520004", qty=1)
        aid = self._address(cust, location_id, "520004", "TEST_NoSlot")
        r = cust.post(f"{API}/orders", json={
            "location_id": location_id, "address_id": aid,
            "delivery_type": "slot", "payment_method": "cod"}, timeout=30)
        assert r.status_code == 400
        assert "slot" in r.json()["detail"].lower()

    def test_express_order_520004_adds_100(self, cust, location_id):
        prod, cart = self._fill_cart(cust, location_id, "520004", qty=2)
        subtotal = cart["subtotal"]
        aid = self._address(cust, location_id, "520004", "TEST_Express")
        r = cust.post(f"{API}/orders", json={
            "location_id": location_id, "address_id": aid,
            "delivery_type": "express", "payment_method": "cod"}, timeout=30)
        assert r.status_code == 200, r.text
        o = r.json()
        TestCheckoutAndOrders.created_orders.append(o["id"])
        assert o["delivery_type"] == "express"
        assert o["express_charge"] == 100, o
        assert o["is_express"] is True and o["is_priority"] is True
        assert o["slot_id"] is None and o["slot_label"] is None
        expected = round(subtotal + o["delivery_charge"] + 100 - o["coupon_discount"]
                         - o["delivery_discount"], 2)
        assert abs(o["final_amount"] - expected) < 0.01, (o["final_amount"], expected)
        TestCheckoutAndOrders.express_order = o

    def test_express_rejected_for_disabled_pin_520005(self, cust, location_id):
        self._fill_cart(cust, location_id, "520005", qty=1)
        aid = self._address(cust, location_id, "520005", "TEST_NoExpress")
        r = cust.post(f"{API}/orders", json={
            "location_id": location_id, "address_id": aid,
            "delivery_type": "express", "payment_method": "cod"}, timeout=30)
        assert r.status_code == 400, r.text
        assert "30 minutes" in r.json()["detail"].lower()
        cust.delete(f"{API}/cart", params={"location_id": location_id}, timeout=30)

    def test_customer_order_list_and_detail(self, cust):
        r = cust.get(f"{API}/orders", timeout=30)
        assert r.status_code == 200
        orders = r.json()
        assert len(orders) > 0
        for oid in TestCheckoutAndOrders.created_orders:
            assert any(o["id"] == oid for o in orders)
        oid = TestCheckoutAndOrders.created_orders[-1]
        d = cust.get(f"{API}/orders/{oid}", timeout=30)
        assert d.status_code == 200, d.text
        o = d.json()
        assert o["items"] and o["status_history"]
        assert o["customer_status"] == "Order Placed"
        assert "_id" not in o

    def test_other_users_order_forbidden(self, cust, location_id):
        # register a throwaway user and try to read our order
        ts = int(time.time())
        s = requests.Session()
        s.post(f"{API}/auth/register", json={
            "name": "TEST Other", "email": f"TEST_other{ts}@example.com",
            "phone": "9876500003", "password": "Test@12345"}, timeout=30)
        oid = TestCheckoutAndOrders.created_orders[-1]
        r = s.get(f"{API}/orders/{oid}", timeout=30)
        assert r.status_code == 403, r.status_code

    def test_admin_order_list_and_status_flow(self, admin):
        r = admin.get(f"{API}/admin/orders", timeout=30)
        assert r.status_code == 200
        ids = {o["id"] for o in r.json()}
        for oid in TestCheckoutAndOrders.created_orders:
            assert oid in ids
        exp = getattr(TestCheckoutAndOrders, "express_order", None)
        if exp:
            row = next(o for o in r.json() if o["id"] == exp["id"])
            assert row["delivery_type"] == "express"
            assert row["express_charge"] == 100

        oid = TestCheckoutAndOrders.created_orders[0]
        a = admin.put(f"{API}/admin/orders/{oid}/accept", timeout=30)
        assert a.status_code == 200, a.text
        assert a.json()["status"] == "accepted"
        for st in ("confirmed", "preparing"):
            u = admin.put(f"{API}/admin/orders/{oid}/status", json={"status": st}, timeout=30)
            assert u.status_code == 200, u.text
            assert u.json()["status"] == st
        # backwards move blocked
        b = admin.put(f"{API}/admin/orders/{oid}/status", json={"status": "pending"}, timeout=30)
        assert b.status_code == 400
        # invalid status
        i = admin.put(f"{API}/admin/orders/{oid}/status", json={"status": "bogus"}, timeout=30)
        assert i.status_code == 400
        # persistence
        g = admin.get(f"{API}/admin/orders", timeout=30)
        row = next(o for o in g.json() if o["id"] == oid)
        assert row["status"] == "preparing"

    def test_pending_count(self, admin):
        r = admin.get(f"{API}/admin/orders/pending-count", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json()["count"], int)

    @classmethod
    def teardown_class(cls):
        """Cancel test orders (releases inventory) and delete test addresses."""
        emails, pwds = _creds()
        a = requests.Session()
        a.post(f"{API}/auth/login", json={"email": emails[0], "password": pwds[0]}, timeout=30)
        for oid in cls.created_orders:
            a.put(f"{API}/admin/orders/{oid}/status", json={"status": "cancelled"}, timeout=30)
        c = requests.Session()
        c.post(f"{API}/auth/login", json={"email": emails[1], "password": pwds[1]}, timeout=30)
        for aid in cls.created_addresses:
            if aid:
                c.delete(f"{API}/addresses/{aid}", timeout=30)


# ==================== Coupons / wallet / referral / offers regression ====================
class TestRegressionEndpoints:
    def test_public_coupons(self, location_id):
        r = requests.get(f"{API}/coupons", params={"location_id": location_id}, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_available_coupons_customer(self, cust, location_id):
        r = cust.get(f"{API}/coupons/available", params={"location_id": location_id}, timeout=30)
        assert r.status_code == 200, r.text

    def test_wallet(self, cust):
        r = cust.get(f"{API}/me/wallet", timeout=30)
        assert r.status_code == 200, r.text
        assert "balance" in r.json()

    def test_referral(self, cust):
        r = cust.get(f"{API}/me/referral", timeout=30)
        assert r.status_code == 200, r.text

    def test_admin_pages_endpoints(self, admin, location_id):
        endpoints = [
            (f"{API}/admin/inventory", {"location_id": location_id}),
            (f"{API}/admin/inventory/summary", {"location_id": location_id}),
            (f"{API}/admin/coupons", {}),
            (f"{API}/admin/analytics/overview", {}),
            (f"{API}/admin/analytics/products", {}),
            (f"{API}/admin/analytics/pin-stats", {}),
            (f"{API}/admin/analytics/payments", {}),
            (f"{API}/admin/analytics/wallet", {}),
            (f"{API}/admin/wallet/overview/balances", {}),
            (f"{API}/admin/referrals", {}),
            (f"{API}/admin/products", {}),
            (f"{API}/admin/combo-banners", {}),
        ]
        failures = []
        for url, params in endpoints:
            r = admin.get(url, params=params, timeout=60)
            if r.status_code != 200:
                failures.append((url, r.status_code, r.text[:200]))
        assert not failures, failures


# ==================== Notification center ====================
class TestNotifications:
    def test_segments(self, admin):
        r = admin.get(f"{API}/admin/notifications/segments", timeout=60)
        assert r.status_code == 200, r.text
        keys = {s["key"] for s in r.json()}
        assert {"all", "new", "active", "inactive", "high_value", "with_wallet"} <= keys
        allseg = next(s for s in r.json() if s["key"] == "all")
        assert allseg["count"] > 0

    def test_compose_send_now_and_customer_receives(self, admin, cust):
        before = cust.get(f"{API}/me/notifications/unread-count", timeout=30).json()["count"]
        title = f"TEST_QA Notice {int(time.time())}"
        r = admin.post(f"{API}/admin/notifications", json={
            "title": title, "body": "TEST_QA broadcast body", "target_type": "all",
            "type": "announcement", "deep_link": "/offers"}, timeout=60)
        assert r.status_code == 200, r.text
        camp = r.json()
        assert camp["status"] in ("sending", "sent")
        assert camp["recipient_count"] > 0
        assert "_id" not in camp
        TestNotifications.campaign_id = camp["id"]

        # wait for background dispatch
        deadline = time.time() + 30
        detail = None
        while time.time() < deadline:
            detail = admin.get(f"{API}/admin/notifications/{camp['id']}", timeout=30).json()
            if detail.get("status") == "sent":
                break
            time.sleep(2)
        assert detail and detail["status"] == "sent", detail
        assert detail["delivered_count"] == detail["recipient_count"]

        # appears in history
        hist = admin.get(f"{API}/admin/notifications", timeout=30)
        assert hist.status_code == 200
        assert any(c["id"] == camp["id"] and c["title"] == title for c in hist.json())

        # customer side
        lst = cust.get(f"{API}/me/notifications", timeout=30)
        assert lst.status_code == 200
        mine = [n for n in lst.json() if n["title"] == title]
        assert mine, "customer did not receive the broadcast"
        assert mine[0]["read"] is False
        assert mine[0]["deep_link"] == "/offers"
        after = cust.get(f"{API}/me/notifications/unread-count", timeout=30).json()["count"]
        assert after >= before + 1

        # mark all read clears badge
        assert cust.post(f"{API}/me/notifications/read-all", timeout=30).status_code == 200
        assert cust.get(f"{API}/me/notifications/unread-count", timeout=30).json()["count"] == 0

    def test_compose_validation(self, admin):
        r = admin.post(f"{API}/admin/notifications", json={
            "title": "TEST_QA", "body": "x", "target_type": "selected", "customer_ids": []}, timeout=30)
        assert r.status_code == 400
        r2 = admin.post(f"{API}/admin/notifications", json={
            "title": "TEST_QA", "body": "x", "target_type": "segment"}, timeout=30)
        assert r2.status_code == 400
        r3 = admin.post(f"{API}/admin/notifications", json={
            "title": "", "body": "x", "target_type": "all"}, timeout=30)
        assert r3.status_code == 422

    def test_scheduled_campaign_and_cancel(self, admin):
        from datetime import datetime, timezone, timedelta
        when = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()
        r = admin.post(f"{API}/admin/notifications", json={
            "title": f"TEST_QA Scheduled {int(time.time())}", "body": "TEST_QA later",
            "target_type": "all", "scheduled_at": when}, timeout=60)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "scheduled"
        cid = r.json()["id"]
        c = admin.delete(f"{API}/admin/notifications/{cid}", timeout=30)
        assert c.status_code == 200
        assert admin.get(f"{API}/admin/notifications/{cid}", timeout=30).json()["status"] == "cancelled"

    def test_device_token_register_and_remove(self, cust):
        tok = f"TEST_QA_token_{int(time.time())}"
        r = cust.put(f"{API}/me/device-tokens", json={
            "token": tok, "platform": "android", "device_id": "TEST_QA_device"}, timeout=30)
        assert r.status_code == 200, r.text
        d = cust.delete(f"{API}/me/device-tokens/{tok}", timeout=30)
        assert d.status_code == 200

    def test_notification_endpoints_require_auth(self):
        assert requests.get(f"{API}/me/notifications", timeout=30).status_code == 401
        assert requests.get(f"{API}/admin/notifications", timeout=30).status_code == 401


# ==================== SEO ====================
class TestSeo:
    def test_robots(self):
        r = requests.get(f"{API}/seo/robots.txt", timeout=30)
        assert r.status_code == 200, r.text
        assert "text/plain" in r.headers.get("content-type", "")
        assert "User-agent: *" in r.text
        assert "Disallow: /admin" in r.text
        assert "Sitemap:" in r.text

    def test_sitemap(self):
        r = requests.get(f"{API}/seo/sitemap.xml", timeout=60)
        assert r.status_code == 200, r.text
        assert "xml" in r.headers.get("content-type", "")
        assert r.text.startswith("<?xml")
        assert "<urlset" in r.text
        assert r.text.count("<url>") >= 3
        assert "/products" in r.text and "/offers" in r.text
        assert "/product/" in r.text, "no product URLs in sitemap"

    def test_root_robots_and_sitemap_proxy(self):
        """Root paths may not be remapped in preview ingress - report only."""
        out = {}
        for path in ("/robots.txt", "/sitemap.xml"):
            try:
                r = requests.get(f"{BASE_URL}{path}", timeout=30)
                out[path] = (r.status_code, r.headers.get("content-type"), r.text[:60])
            except Exception as e:  # pragma: no cover
                out[path] = ("error", str(e), "")
        print("ROOT SEO PATHS:", out)
