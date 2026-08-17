"""
Iteration 4 tests: banner scheduling, banner reorder, public coupons, regression checks.
"""
import os
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://grocery-hub-1077.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "prudhvirajm847@gmail.com", "password": "Admin@12345"}
CUSTOMER = {"email": "customer@test.com", "password": "Test@12345"}


def _login_session(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def admin_session():
    return _login_session(ADMIN)


@pytest.fixture(scope="session")
def customer_session():
    return _login_session(CUSTOMER)


# Backwards-compat name used throughout tests (returns a Session, not headers dict)
@pytest.fixture(scope="session")
def admin_headers(admin_session):
    return admin_session


@pytest.fixture(scope="session")
def customer_headers(customer_session):
    return customer_session


@pytest.fixture(scope="session")
def any_location():
    r = requests.get(f"{API}/locations", timeout=20)
    assert r.status_code == 200
    locs = r.json()
    assert locs, "No locations seeded"
    return locs[0]


# ---------------- Banner scheduling ----------------
class TestBannerScheduling:

    @pytest.fixture(autouse=True)
    def _cleanup(self, admin_headers):
        self.created = []
        yield
        for bid in self.created:
            try:
                admin_headers.delete(f"{API}/admin/combo-banners/{bid}", timeout=15)
            except Exception:
                pass

    def _create(self, admin_headers, **overrides):
        payload = {
            "title": "TEST_SCHED_BANNER",
            "subtitle": "temp",
            "image_url": "https://example.com/x.jpg",
            "cta_text": "View",
            "display_order": 99,
            "is_active": True,
            "location_ids": [],
        }
        payload.update(overrides)
        r = admin_headers.post(f"{API}/admin/combo-banners", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        b = r.json()
        self.created.append(b["id"])
        return b

    def test_future_start_excluded_from_public(self, admin_headers):
        future = (date.today() + timedelta(days=10)).isoformat()
        b = self._create(admin_headers, title="TEST_FUTURE", start_date=future)
        # public
        pub = requests.get(f"{API}/combo-banners", timeout=20).json()
        assert not any(x["id"] == b["id"] for x in pub), "future-start banner should be excluded"
        # admin still sees it
        adm = admin_headers.get(f"{API}/admin/combo-banners", timeout=20).json()
        assert any(x["id"] == b["id"] for x in adm), "admin must still see scheduled banner"

    def test_past_end_excluded_from_public(self, admin_headers):
        past = (date.today() - timedelta(days=2)).isoformat()
        b = self._create(admin_headers, title="TEST_EXPIRED", end_date=past)
        pub = requests.get(f"{API}/combo-banners", timeout=20).json()
        assert not any(x["id"] == b["id"] for x in pub), "past-end banner should be excluded"
        adm = admin_headers.get(f"{API}/admin/combo-banners", timeout=20).json()
        assert any(x["id"] == b["id"] for x in adm)

    def test_active_window_included(self, admin_headers):
        sd = (date.today() - timedelta(days=5)).isoformat()
        ed = (date.today() + timedelta(days=5)).isoformat()
        b = self._create(admin_headers, title="TEST_ACTIVE_WINDOW", start_date=sd, end_date=ed)
        pub = requests.get(f"{API}/combo-banners", timeout=20).json()
        assert any(x["id"] == b["id"] for x in pub), "in-window banner must be included"

    def test_null_dates_included(self, admin_headers):
        b = self._create(admin_headers, title="TEST_NO_DATES", start_date=None, end_date=None)
        pub = requests.get(f"{API}/combo-banners", timeout=20).json()
        assert any(x["id"] == b["id"] for x in pub)

    def test_end_date_inclusive_today(self, admin_headers):
        today = date.today().isoformat()
        b = self._create(admin_headers, title="TEST_TODAY_END", end_date=today)
        pub = requests.get(f"{API}/combo-banners", timeout=20).json()
        assert any(x["id"] == b["id"] for x in pub), "end_date=today should still show (inclusive)"


# ---------------- Banner reorder ----------------
class TestBannerReorder:

    def test_reorder_route_not_captured_by_banner_id(self, admin_headers):
        # Fetch existing banners
        r = admin_headers.get(f"{API}/admin/combo-banners", timeout=20)
        assert r.status_code == 200
        banners = r.json()
        assert len(banners) >= 2, "Need >=2 banners to test reorder"
        ids = [b["id"] for b in banners]

        # Reverse order
        reversed_ids = list(reversed(ids))
        rr = admin_headers.put(f"{API}/admin/combo-banners/reorder",
                          json={"ordered_ids": reversed_ids},
                          timeout=20)
        assert rr.status_code == 200, f"reorder failed: {rr.status_code} {rr.text}"
        assert rr.json().get("count") == len(reversed_ids)

        # Verify via admin GET
        r2 = admin_headers.get(f"{API}/admin/combo-banners", timeout=20).json()
        got_ids = [b["id"] for b in r2]
        assert got_ids[:len(reversed_ids)] == reversed_ids, f"Order mismatch got={got_ids} want={reversed_ids}"

        # restore original
        admin_headers.put(f"{API}/admin/combo-banners/reorder",
                     json={"ordered_ids": ids},
                     timeout=20)

    def test_reorder_requires_admin_no_auth(self):
        r = requests.put(f"{API}/admin/combo-banners/reorder",
                         json={"ordered_ids": []}, timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_reorder_customer_forbidden(self, customer_headers):
        r = customer_headers.put(f"{API}/admin/combo-banners/reorder",
                         json={"ordered_ids": []}, timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 for customer, got {r.status_code}"


# ---------------- Public coupons ----------------
class TestPublicCoupons:

    def test_public_list_returns_seeded(self):
        r = requests.get(f"{API}/coupons", timeout=20)
        assert r.status_code == 200
        codes = [c["code"] for c in r.json()]
        assert "WELCOME50" in codes
        assert "SAVE10" in codes

    def test_public_response_safe_fields_only(self):
        r = requests.get(f"{API}/coupons", timeout=20).json()
        assert r, "no coupons"
        allowed = {"code", "discount_type", "discount_value", "min_order_value", "max_discount", "end_date"}
        for c in r:
            leaked = set(c.keys()) - allowed
            assert not leaked, f"Coupon leaks fields: {leaked}"
            assert "id" not in c
            assert "location_ids" not in c

    def test_welcome50_shape(self):
        r = requests.get(f"{API}/coupons", timeout=20).json()
        w = next((c for c in r if c["code"] == "WELCOME50"), None)
        assert w
        assert w["discount_type"] == "fixed"
        assert w["discount_value"] == 50
        assert w["min_order_value"] == 299

    def test_save10_shape(self):
        r = requests.get(f"{API}/coupons", timeout=20).json()
        s = next((c for c in r if c["code"] == "SAVE10"), None)
        assert s
        assert s["discount_type"] == "percentage"
        assert s["discount_value"] == 10
        assert s["max_discount"] == 150
        assert s["min_order_value"] == 499

    def test_location_filter_applied(self, any_location):
        r = requests.get(f"{API}/coupons?location_id={any_location['id']}", timeout=20)
        assert r.status_code == 200
        # seeded coupons are location-agnostic -> should still appear
        codes = [c["code"] for c in r.json()]
        assert "WELCOME50" in codes


# ---------------- Regression: combo carousel ----------------
class TestComboCarouselRegression:

    def test_public_banners_still_returned(self):
        r = requests.get(f"{API}/combo-banners", timeout=20)
        assert r.status_code == 200
        banners = r.json()
        assert len(banners) >= 3
        # Ensure package enrichment intact
        with_pkg = [b for b in banners if b.get("package")]
        assert with_pkg, "No enriched packages"
        p = with_pkg[0]["package"]
        assert "price" in p and "savings" in p and "items_value" in p

    def test_max_5_cap(self):
        r = requests.get(f"{API}/combo-banners", timeout=20).json()
        assert len(r) <= 5


# ---------------- Regression: coupon validate ----------------
class TestCouponValidateRegression:

    def test_welcome50_valid(self, any_location):
        r = requests.post(f"{API}/coupons/validate",
                          json={"code": "WELCOME50", "location_id": any_location["id"], "subtotal": 500},
                          timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["discount"] == 50

    def test_welcome50_below_min(self, any_location):
        r = requests.post(f"{API}/coupons/validate",
                          json={"code": "WELCOME50", "location_id": any_location["id"], "subtotal": 100},
                          timeout=20)
        assert r.status_code == 400
