"""Iteration 8 backend tests: PIN serviceability, pin-aware orders, category dedupe,
coupons available + stacking, inventory, wallet, referral."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://grocery-hub-1077.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "prudhvirajm847@gmail.com"
ADMIN_PASSWORD = "Admin@12345"
CUST_EMAIL = "customer@test.com"
CUST_PASSWORD = "Test@12345"

SERVICEABLE_PIN = "500034"
UNSERVICEABLE_PIN = "999999"


# ---------- fixtures ----------
def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def cust_token():
    try:
        return _login(CUST_EMAIL, CUST_PASSWORD)
    except AssertionError as e:
        pytest.skip(f"customer login failed: {e}")


def _h(_): return {}


# ================= 1. PIN serviceability =================
class TestPincode:
    def test_check_serviceable(self):
        r = requests.get(f"{API}/pincodes/check", params={"pincode": SERVICEABLE_PIN})
        assert r.status_code == 200
        d = r.json()
        assert d["serviceable"] is True
        assert "asap_enabled" in d
        assert "delivery_charge" in d
        assert "free_delivery_threshold" in d
        assert "location" in d and d["location"].get("id")

    def test_check_unserviceable(self):
        r = requests.get(f"{API}/pincodes/check", params={"pincode": UNSERVICEABLE_PIN})
        assert r.status_code == 200
        assert r.json()["serviceable"] is False

    def test_address_reject_unserviceable(self, cust_token):
        payload = {
            "label": "TEST", "full_name": "T U", "phone": "9999999999",
            "line1": "1", "city": "X", "pincode": UNSERVICEABLE_PIN,
            "location_id": "dummy", "is_default": False,
        }
        r = cust_token.post(f"{API}/addresses", json=payload)
        assert r.status_code == 400
        assert "PIN" in r.json().get("detail", "") or "deliver" in r.json().get("detail", "").lower()

    def test_address_accept_serviceable_autoset_loc(self, cust_token):
        payload = {
            "label": "TEST_ITER8", "full_name": "T U", "phone": "9999999999",
            "line1": "1 Test St", "city": "Hyd", "pincode": SERVICEABLE_PIN,
            "location_id": "wrongloc", "is_default": False,
        }
        r = cust_token.post(f"{API}/addresses", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        # location_id should be auto-corrected to the PIN's location
        chk = cust_token.get(f"{API}/pincodes/check", params={"pincode": SERVICEABLE_PIN}).json()
        assert d["location_id"] == chk["location"]["id"]
        # cleanup
        cust_token.delete(f"{API}/addresses/{d['id']}")


# ================= 2. Admin can set asap_enabled + free_delivery_threshold =================
class TestPincodeAdminFields:
    """Regression: PinCodeInput must accept asap_enabled and free_delivery_threshold."""

    def test_update_pincode_persists_asap_and_threshold(self, admin_token):
        pins = admin_token.get(f"{API}/admin/pincodes").json()
        target = next((p for p in pins if p["pincode"] == SERVICEABLE_PIN), None)
        assert target, "SERVICEABLE_PIN not found in admin list"
        orig_asap = target.get("asap_enabled", True)
        orig_thr = target.get("free_delivery_threshold")

        # try to toggle asap to False and set threshold
        payload = {**target, "asap_enabled": False, "free_delivery_threshold": 1234}
        # only send fields accepted by PinCodeInput; but pass extras too — model may ignore
        payload.pop("id", None); payload.pop("created_at", None); payload.pop("updated_at", None); payload.pop("_id", None)
        r = admin_token.put(f"{API}/admin/pincodes/{target['id']}", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("asap_enabled") is False, "asap_enabled did not persist via admin update (model may be missing field)"
        assert d.get("free_delivery_threshold") == 1234, "free_delivery_threshold did not persist"

        # restore
        restore = {**target, "asap_enabled": orig_asap, "free_delivery_threshold": orig_thr}
        restore.pop("id", None); restore.pop("created_at", None); restore.pop("updated_at", None); restore.pop("_id", None)
        admin_token.put(f"{API}/admin/pincodes/{target['id']}", json=restore)


# ================= 3. Category dedupe =================
class TestCategoryDedupe:
    def test_duplicate_category_rejected(self, admin_token):
        cats = admin_token.get(f"{API}/admin/categories").json()
        assert cats, "no categories"
        name = cats[0]["name"]
        r = admin_token.post(f"{API}/admin/categories", json={"name": name, "parent_id": None})
        assert r.status_code == 400
        assert "exists" in r.json()["detail"].lower()

    def test_public_categories_no_dupes(self):
        r = requests.get(f"{API}/categories")
        names = [c["name"].strip().lower() for c in r.json()]
        assert len(names) == len(set(names))

    def test_subcategories_by_parent(self):
        cats = requests.get(f"{API}/categories").json()
        assert cats
        cid = cats[0]["id"]
        r = requests.get(f"{API}/subcategories", params={"category_id": cid})
        assert r.status_code == 200
        for s in r.json():
            assert s.get("parent_id") == cid


# ================= 4. Coupons available =================
class TestCouponsAvailable:
    @pytest.fixture(scope="class")
    def pin_coupon(self, admin_token):
        code = "TESTPIN" + uuid.uuid4().hex[:4].upper()
        payload = {
            "code": code, "coupon_type": "product", "discount_type": "fixed",
            "discount_value": 20, "min_order_value": 100, "is_active": True,
            "pin_codes": [SERVICEABLE_PIN],
        }
        r = admin_token.post(f"{API}/admin/coupons", json=payload)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        yield code
        admin_token.delete(f"{API}/admin/coupons/{cid}")

    def test_available_needs_auth(self):
        r = requests.get(f"{API}/coupons/available", params={"location_id": "x"})
        assert r.status_code in (401, 403)

    def test_pin_targeted_appears_only_for_matching_pin(self, cust_token, pin_coupon):
        chk = requests.get(f"{API}/pincodes/check", params={"pincode": SERVICEABLE_PIN}).json()
        loc = chk["location"]["id"]
        r1 = cust_token.get(f"{API}/coupons/available",
                          params={"location_id": loc, "subtotal": 500, "pincode": SERVICEABLE_PIN})
        assert r1.status_code == 200
        codes1 = [c["code"] for c in r1.json()]
        assert pin_coupon in codes1

        r2 = cust_token.get(f"{API}/coupons/available",
                          params={"location_id": loc, "subtotal": 500, "pincode": "500081"})
        codes2 = [c["code"] for c in r2.json()]
        assert pin_coupon not in codes2

    def test_eligible_flag_below_min(self, cust_token, pin_coupon):
        chk = requests.get(f"{API}/pincodes/check", params={"pincode": SERVICEABLE_PIN}).json()
        loc = chk["location"]["id"]
        r = cust_token.get(f"{API}/coupons/available",
                        params={"location_id": loc, "subtotal": 10, "pincode": SERVICEABLE_PIN}).json()
        item = next((c for c in r if c["code"] == pin_coupon), None)
        assert item is not None
        assert item["eligible"] is False
        assert item["reason"]


# ================= 5. Coupon stacking =================
class TestCouponStacking:
    def test_two_product_coupons_rejected(self, admin_token):
        # find two product coupons
        cs = admin_token.get(f"{API}/admin/coupons").json()
        prod = [c for c in cs if c.get("coupon_type", "product") == "product" and c.get("is_active")][:2]
        if len(prod) < 2:
            pytest.skip("need two product coupons")
        chk = admin_token.get(f"{API}/pincodes/check", params={"pincode": SERVICEABLE_PIN}).json()
        loc = chk["location"]["id"]
        r = requests.post(f"{API}/coupons/validate", json={
            "code": prod[1]["code"], "location_id": loc, "subtotal": 5000,
            "applied_codes": [prod[0]["code"]],
        })
        assert r.status_code == 400
        assert "one" in r.json()["detail"].lower()

    def test_product_plus_delivery_ok(self, admin_token):
        cs = admin_token.get(f"{API}/admin/coupons").json()
        prod = next((c for c in cs if c.get("coupon_type", "product") == "product" and c.get("is_active")), None)
        deliv = next((c for c in cs if c.get("coupon_type") == "delivery" and c.get("is_active")), None)
        if not prod or not deliv:
            pytest.skip("need one product + one delivery coupon")
        chk = admin_token.get(f"{API}/pincodes/check", params={"pincode": SERVICEABLE_PIN}).json()
        loc = chk["location"]["id"]
        r = requests.post(f"{API}/coupons/validate", json={
            "code": deliv["code"], "location_id": loc, "subtotal": 5000,
            "delivery_charge": 40, "asap_charge": 0,
            "applied_codes": [prod["code"]],
        })
        assert r.status_code == 200, r.text
        assert r.json()["coupon_type"] == "delivery"


# ================= 6. Inventory / order (PIN-aware) =================
class TestOrders:
    def _seed_cart_and_addr(self, cust_token):
        chk = requests.get(f"{API}/pincodes/check", params={"pincode": SERVICEABLE_PIN}).json()
        loc = chk["location"]["id"]
        # get a product with stock at loc
        prods = requests.get(f"{API}/products", params={"location_id": loc, "limit": 50}).json()
        items = prods.get("products") if isinstance(prods, dict) else prods
        pid = None
        for p in items:
            if (p.get("stock") or p.get("available_quantity") or 0) > 5 and p.get("in_stock", True):
                pid = p["id"]; break
        assert pid, "no in-stock product"
        # create address
        addr_payload = {
            "label": "TEST_ORD", "full_name": "T U", "phone": "9999999999",
            "line1": "1 Test", "city": "Hyd", "pincode": SERVICEABLE_PIN,
            "location_id": loc, "is_default": False,
        }
        addr = cust_token.post(f"{API}/addresses", json=addr_payload).json()
        # add to cart
        for _ in range(3):
            cust_token.post(f"{API}/cart/add",
                          json={"product_id": pid, "location_id": loc, "quantity": 1})
        return loc, addr, pid, chk

    def test_order_uses_pin_delivery_charge(self, cust_token, admin_token):
        loc, addr, pid, chk = self._seed_cart_and_addr(cust_token)
        try:
            r = cust_token.post(f"{API}/orders", json={
                "location_id": loc, "address_id": addr["id"], "delivery_type": "asap",
                "payment_method": "cod",
            })
            if r.status_code != 200:
                # ASAP could be disabled — try slot then
                slots = requests.get(f"{API}/delivery/slots", params={"location_id": loc}).json()
                # find first available slot
                sid = None
                for day in slots.get("days", []):
                    for s in day.get("slots", []):
                        if s.get("available"): sid = s["id"]; break
                    if sid: break
                assert sid, f"no slot: order failed with: {r.text}"
                r = cust_token.post(f"{API}/orders", json={
                    "location_id": loc, "address_id": addr["id"], "delivery_type": "slot",
                    "slot_id": sid, "payment_method": "cod",
                })
            assert r.status_code == 200, r.text
            order = r.json()
            expected_pin_delivery = chk["delivery_charge"]
            thr = chk.get("free_delivery_threshold")
            if thr and order["subtotal"] >= thr:
                assert order["delivery_charge"] == 0
                assert order.get("free_delivery_applied")
            else:
                assert order["delivery_charge"] == expected_pin_delivery, \
                    f"expected pin delivery {expected_pin_delivery}, got {order['delivery_charge']}"
            # asap separate
            if order["delivery_type"] == "asap":
                assert order["asap_charge"] > 0
            # cancel — restore inventory
            oid = order["id"]
            cr = admin_token.put(f"{API}/admin/orders/{oid}/status",
                              json={"status": "cancelled"})
            assert cr.status_code == 200
        finally:
            cust_token.delete(f"{API}/addresses/{addr['id']}")


# ================= 7. Wallet =================
class TestWallet:
    def test_wallet_balance_matches_ledger(self, cust_token):
        r = cust_token.get(f"{API}/me/wallet")
        assert r.status_code == 200
        d = r.json()
        ledger_sum = round(sum(e["amount"] for e in d["ledger"] if e.get("status") != "cancelled"), 2)
        assert abs(ledger_sum - d["balance"]) < 0.02
        assert d["balance"] >= 0
        for e in d["ledger"]:
            # required audit fields (created_at optional on legacy entries)
            assert "amount" in e
            assert "balance_after" in e

    def test_admin_wallet_get(self, admin_token, cust_token):
        me = cust_token.get(f"{API}/auth/me").json()
        uid = me["id"]
        r = admin_token.get(f"{API}/admin/wallet/{uid}")
        assert r.status_code == 200
        assert "balance" in r.json() and "ledger" in r.json()


# ================= 8. Referral =================
class TestReferral:
    def test_self_referral_rejected(self, cust_token):
        me = cust_token.get(f"{API}/me/referral").json()
        my_code = me["referral_code"]
        r = cust_token.post(f"{API}/referral/apply", params={"code": my_code})
        assert r.status_code == 400
        assert "own" in r.json()["detail"].lower() or "already" in r.json()["detail"].lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
