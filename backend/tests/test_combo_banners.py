"""Tests for Monthly Combo hero carousel: combo-banners API + regression."""
import os
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "prudhvirajm847@gmail.com", "password": "Admin@12345"}
CUST = {"email": "customer@test.com", "password": "Test@12345"}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def cust_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=CUST, timeout=15)
    if r.status_code != 200:
        pytest.skip("customer login failed")
    return s


@pytest.fixture(scope="module")
def location_id():
    r = requests.get(f"{API}/locations", timeout=15)
    assert r.status_code == 200
    locs = r.json()
    assert len(locs) > 0
    return locs[0]["id"]


# ---------- Public banners ----------
def test_public_banners_returns_active_enriched(location_id):
    r = requests.get(f"{API}/combo-banners", params={"location_id": location_id}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert 1 <= len(data) <= 5
    # sorted by display_order
    orders = [b.get("display_order", 0) for b in data]
    assert orders == sorted(orders)
    # enriched with package info
    for b in data:
        assert b.get("is_active") is True
        assert "package" in b
        pkg = b["package"]
        assert {"id", "name", "price", "items_value", "savings", "item_count"} <= set(pkg.keys())


def test_public_banners_no_location_param():
    r = requests.get(f"{API}/combo-banners", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- Admin CRUD & guard ----------
def test_admin_list_requires_auth():
    r = requests.get(f"{API}/admin/combo-banners", timeout=15)
    assert r.status_code in (401, 403)


def test_admin_create_requires_auth():
    r = requests.post(f"{API}/admin/combo-banners", json={"title": "X"}, timeout=15)
    assert r.status_code in (401, 403)


def test_customer_cannot_access_admin(cust_session):
    r = cust_session.get(f"{API}/admin/combo-banners", timeout=15)
    assert r.status_code == 403


def test_admin_list_all_including_inactive(admin_session):
    r = admin_session.get(f"{API}/admin/combo-banners", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- Full lifecycle: location filter, active toggle, order, max 5 ----------
@pytest.fixture(scope="module")
def extra_location(admin_session):
    payload = {"name": "TEST_LOC_COMBO", "city": "TestCity", "area": "TestArea",
               "pincodes": ["999001"], "delivery_available": True,
               "delivery_charge": 0, "min_order_value": 0, "is_active": True}
    r = admin_session.post(f"{API}/admin/locations", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    lid = r.json()["id"]
    yield lid
    admin_session.delete(f"{API}/admin/locations/{lid}", timeout=15)


@pytest.fixture(scope="module")
def created_banner_ids(admin_session, location_id, extra_location):
    """Create several TEST banners to exercise all rules."""
    ids = []
    # 1 banner scoped to extra_location only
    r = admin_session.post(f"{API}/admin/combo-banners", json={
        "title": "TEST_ONLY_EXTRA", "image_url": "https://x/y.jpg",
        "display_order": 50, "is_active": True, "location_ids": [extra_location],
    }, timeout=15)
    assert r.status_code == 200, r.text
    ids.append(r.json()["id"])
    # 6 banners on primary location to test cap-of-5
    for i in range(6):
        r = admin_session.post(f"{API}/admin/combo-banners", json={
            "title": f"TEST_CAP_{i}", "image_url": "https://x/z.jpg",
            "display_order": 100 + i, "is_active": True,
            "location_ids": [location_id],
        }, timeout=15)
        assert r.status_code == 200
        ids.append(r.json()["id"])
    yield ids
    for bid in ids:
        admin_session.delete(f"{API}/admin/combo-banners/{bid}", timeout=15)


def test_location_filter_scoped(created_banner_ids, extra_location, location_id):
    # scoped banner should show only on its location
    r_extra = requests.get(f"{API}/combo-banners", params={"location_id": extra_location}, timeout=15).json()
    titles_extra = [b["title"] for b in r_extra]
    assert "TEST_ONLY_EXTRA" in titles_extra

    r_prim = requests.get(f"{API}/combo-banners", params={"location_id": location_id}, timeout=15).json()
    titles_prim = [b["title"] for b in r_prim]
    assert "TEST_ONLY_EXTRA" not in titles_prim


def test_max_5_cap(created_banner_ids, location_id):
    r = requests.get(f"{API}/combo-banners", params={"location_id": location_id}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 5


def test_ordering(created_banner_ids, location_id):
    data = requests.get(f"{API}/combo-banners", params={"location_id": location_id}, timeout=15).json()
    orders = [b.get("display_order", 0) for b in data]
    assert orders == sorted(orders)


def test_deactivate_removes_and_reactivate_restores(admin_session, created_banner_ids, extra_location):
    bid = created_banner_ids[0]  # the extra_only banner
    # deactivate
    r = admin_session.put(f"{API}/admin/combo-banners/{bid}", json={
        "title": "TEST_ONLY_EXTRA", "image_url": "https://x/y.jpg",
        "display_order": 50, "is_active": False, "location_ids": [extra_location],
    }, timeout=15)
    assert r.status_code == 200
    listed = requests.get(f"{API}/combo-banners", params={"location_id": extra_location}, timeout=15).json()
    assert all(b["id"] != bid for b in listed)
    # reactivate
    r = admin_session.put(f"{API}/admin/combo-banners/{bid}", json={
        "title": "TEST_ONLY_EXTRA", "image_url": "https://x/y.jpg",
        "display_order": 50, "is_active": True, "location_ids": [extra_location],
    }, timeout=15)
    assert r.status_code == 200
    listed = requests.get(f"{API}/combo-banners", params={"location_id": extra_location}, timeout=15).json()
    assert any(b["id"] == bid for b in listed)


def test_delete_banner(admin_session):
    r = admin_session.post(f"{API}/admin/combo-banners", json={
        "title": "TEST_DEL", "image_url": "x", "display_order": 999,
        "is_active": True, "location_ids": [],
    }, timeout=15)
    bid = r.json()["id"]
    r = admin_session.delete(f"{API}/admin/combo-banners/{bid}", timeout=15)
    assert r.status_code == 200
    # deleting again -> 404
    r = admin_session.delete(f"{API}/admin/combo-banners/{bid}", timeout=15)
    assert r.status_code == 404


# ---------- Combo detail ----------
def test_combo_detail_enriched(location_id):
    banners = requests.get(f"{API}/combo-banners", params={"location_id": location_id}, timeout=15).json()
    seeded = [b for b in banners if b.get("package_id") and not b["title"].startswith("TEST_")]
    assert seeded, "expected seeded combo banner"
    pkg_id = seeded[0]["package_id"]
    r = requests.get(f"{API}/packages/{pkg_id}", timeout=15)
    assert r.status_code == 200
    pkg = r.json()
    assert pkg["id"] == pkg_id
    assert "products" in pkg and len(pkg["products"]) > 0
    assert "items_value" in pkg and "savings" in pkg
    assert pkg["savings"] >= 0


def test_combo_detail_404():
    r = requests.get(f"{API}/packages/does-not-exist", timeout=15)
    assert r.status_code == 404


# ---------- Regression ----------
def test_regression_products_and_categories():
    r = requests.get(f"{API}/products", timeout=15)
    assert r.status_code == 200 and len(r.json()) > 0
    r = requests.get(f"{API}/categories", timeout=15)
    assert r.status_code == 200 and len(r.json()) > 0


def test_regression_locations():
    r = requests.get(f"{API}/locations", timeout=15)
    assert r.status_code == 200 and len(r.json()) > 0


def test_regression_razorpay_disabled():
    r = requests.get(f"{API}/payments/razorpay/config", timeout=15)
    if r.status_code == 200:
        assert r.json().get("razorpay_enabled") is False


def test_regression_admin_orders(admin_session):
    r = admin_session.get(f"{API}/admin/orders", timeout=15)
    assert r.status_code == 200
