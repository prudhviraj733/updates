"""Backend regression tests for SavingSmart Grocery API."""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://grocery-hub-1077.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "prudhvirajm847@gmail.com"
ADMIN_PASS = "Admin@12345"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    assert r.json().get("role") == "admin"
    return s


@pytest.fixture(scope="session")
def customer_creds():
    email = f"test_cust_{uuid.uuid4().hex[:8]}@test.com"
    password = "Test@12345"
    r = requests.post(f"{API}/auth/register", json={
        "name": "Test Customer", "email": email, "phone": "9999999999", "password": password
    })
    assert r.status_code == 200, f"Register failed: {r.text}"
    return {"email": email, "password": password, "id": r.json()["id"]}


@pytest.fixture(scope="session")
def customer_client(customer_creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": customer_creds["email"], "password": customer_creds["password"]})
    assert r.status_code == 200
    return s


@pytest.fixture(scope="session")
def location_id():
    r = requests.get(f"{API}/locations")
    assert r.status_code == 200
    locs = r.json()
    assert len(locs) >= 1
    return locs[0]["id"]


# ---------- Health ----------
def test_health():
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------- Auth ----------
def test_admin_me(admin_client):
    r = admin_client.get(f"{API}/auth/me")
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


def test_customer_me(customer_client):
    r = customer_client.get(f"{API}/auth/me")
    assert r.status_code == 200
    assert r.json()["role"] == "customer"


def test_brute_force_lockout():
    email = f"bf_{uuid.uuid4().hex[:6]}@test.com"
    # 5 wrong attempts (register not needed - just uses login attempts by identifier ip:email)
    codes = []
    for _ in range(6):
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
        codes.append(r.status_code)
    # After 5, next should be 429
    assert 429 in codes, f"Expected 429 after 5 wrong attempts, got: {codes}"


# ---------- Locations ----------
def test_locations_list(location_id):
    assert location_id


def test_admin_create_update_location(admin_client):
    payload = {"name": "TEST_LOC", "city": "TestCity", "area": "TestArea",
               "pincodes": ["500001"], "delivery_charge": 30, "min_order_value": 100}
    r = admin_client.post(f"{API}/admin/locations", json=payload)
    assert r.status_code == 200, r.text
    loc = r.json()
    lid = loc["id"]
    # verify delivery_settings auto-created
    r2 = admin_client.get(f"{API}/admin/delivery/settings", params={"location_id": lid})
    assert r2.status_code == 200
    s = r2.json()
    assert s["operating_start"] == "09:00"
    # update
    payload["name"] = "TEST_LOC_UPDATED"
    r3 = admin_client.put(f"{API}/admin/locations/{lid}", json=payload)
    assert r3.status_code == 200
    assert r3.json()["name"] == "TEST_LOC_UPDATED"
    # cleanup
    admin_client.delete(f"{API}/admin/locations/{lid}")


# ---------- Categories ----------
def test_categories_list():
    r = requests.get(f"{API}/categories")
    assert r.status_code == 200
    cats = r.json()
    assert len(cats) == 9, f"Expected 9 categories, got {len(cats)}"
    orders = [c.get("display_order", 0) for c in cats]
    assert orders == sorted(orders)


def test_admin_categories_forbidden_for_customer(customer_client):
    r = customer_client.get(f"{API}/admin/categories")
    assert r.status_code == 403


def test_admin_categories_unauthenticated():
    r = requests.get(f"{API}/admin/categories")
    assert r.status_code == 401


def test_admin_category_crud(admin_client):
    payload = {"name": "TEST_CAT", "description": "x", "display_order": 99}
    r = admin_client.post(f"{API}/admin/categories", json=payload)
    assert r.status_code == 200
    cid = r.json()["id"]
    payload["name"] = "TEST_CAT_U"
    r = admin_client.put(f"{API}/admin/categories/{cid}", json=payload)
    assert r.status_code == 200
    assert r.json()["name"] == "TEST_CAT_U"
    r = admin_client.delete(f"{API}/admin/categories/{cid}")
    assert r.status_code == 200


# ---------- Products ----------
def test_products_featured(location_id):
    r = requests.get(f"{API}/products", params={"location_id": location_id, "featured": "true"})
    assert r.status_code == 200
    prods = r.json()
    assert len(prods) > 0
    p = prods[0]
    assert "stock" in p
    assert "discount_percent" in p


def test_product_detail(location_id):
    r = requests.get(f"{API}/products", params={"location_id": location_id})
    pid = r.json()[0]["id"]
    r2 = requests.get(f"{API}/products/{pid}", params={"location_id": location_id})
    assert r2.status_code == 200
    assert r2.json()["id"] == pid


def test_admin_create_product_creates_inventory(admin_client, location_id):
    cats = requests.get(f"{API}/categories").json()
    payload = {
        "name": "TEST_PROD", "description": "d", "category_id": cats[0]["id"],
        "images": [], "pack_size": "1kg", "unit": "kg", "mrp": 100, "selling_price": 80,
        "sku": "TEST-SKU", "is_active": True, "is_featured": False, "location_ids": [location_id],
    }
    r = admin_client.post(f"{API}/admin/products", json=payload)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    inv = admin_client.get(f"{API}/admin/inventory", params={"location_id": location_id}).json()
    assert any(i["product_id"] == pid for i in inv)


# ---------- Cart ----------
def _get_product_for_loc(location_id):
    r = requests.get(f"{API}/products", params={"location_id": location_id})
    return r.json()[0]


def test_cart_add_update_remove_clear(customer_client, location_id):
    p = _get_product_for_loc(location_id)
    # add
    r = customer_client.post(f"{API}/cart/items", json={
        "product_id": p["id"], "location_id": location_id, "quantity": 2})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["count"] == 2
    expected_sub = p["selling_price"] * 2
    assert abs(body["subtotal"] - expected_sub) < 0.01

    # update
    r = customer_client.put(f"{API}/cart/items/{p['id']}", json={
        "location_id": location_id, "quantity": 3})
    assert r.status_code == 200
    assert r.json()["count"] == 3

    # overqty -> 409
    r = customer_client.post(f"{API}/cart/items", json={
        "product_id": p["id"], "location_id": location_id, "quantity": 999999})
    assert r.status_code == 409

    # remove
    r = customer_client.delete(f"{API}/cart/items/{p['id']}", params={"location_id": location_id})
    assert r.status_code == 200
    assert r.json()["count"] == 0

    # clear
    r = customer_client.delete(f"{API}/cart", params={"location_id": location_id})
    assert r.status_code == 200


# ---------- Wishlist ----------
def test_wishlist(customer_client, location_id):
    p = _get_product_for_loc(location_id)
    r = customer_client.post(f"{API}/wishlist/{p['id']}")
    assert r.status_code == 200
    r = customer_client.get(f"{API}/wishlist")
    assert r.status_code == 200
    assert any(x["id"] == p["id"] for x in r.json())
    r = customer_client.delete(f"{API}/wishlist/{p['id']}")
    assert r.status_code == 200


# ---------- Delivery ----------
def test_delivery_slots(location_id):
    from datetime import datetime, timedelta
    d = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%d")
    r = requests.get(f"{API}/delivery/slots", params={"location_id": location_id, "date": d})
    assert r.status_code == 200
    data = r.json()
    assert "slots" in data
    assert len(data["slots"]) > 0


def test_admin_update_delivery_settings(admin_client, location_id):
    payload = {
        "operating_start": "08:00", "operating_end": "22:00", "slot_duration_minutes": 60,
        "prep_time_minutes": 60, "max_orders_per_slot": 15, "asap_enabled": True,
        "asap_charge": 100, "holidays": []
    }
    r = admin_client.put(f"{API}/admin/delivery/settings", params={"location_id": location_id}, json=payload)
    assert r.status_code == 200
    assert r.json()["operating_start"] == "08:00"


# ---------- Coupons ----------
def test_validate_welcome50(location_id):
    r = requests.post(f"{API}/coupons/validate", json={
        "code": "WELCOME50", "location_id": location_id, "subtotal": 300})
    assert r.status_code == 200, r.text
    assert r.json()["discount"] == 50


def test_validate_welcome50_min_fail(location_id):
    r = requests.post(f"{API}/coupons/validate", json={
        "code": "WELCOME50", "location_id": location_id, "subtotal": 100})
    assert r.status_code == 400


def test_validate_save10(location_id):
    r = requests.post(f"{API}/coupons/validate", json={
        "code": "SAVE10", "location_id": location_id, "subtotal": 500})
    assert r.status_code == 200
    d = r.json()["discount"]
    assert d == 50.0  # 10% of 500 = 50, capped at 150


def test_validate_save10_capped(location_id):
    r = requests.post(f"{API}/coupons/validate", json={
        "code": "SAVE10", "location_id": location_id, "subtotal": 5000})
    assert r.status_code == 200
    assert r.json()["discount"] == 150  # cap


# ---------- Full Checkout ----------
@pytest.fixture(scope="session")
def address_id(customer_client, location_id):
    payload = {
        "label": "Home", "full_name": "Test", "phone": "9999999999",
        "line1": "1 Test St", "city": "Hyderabad", "pincode": "500034",
        "location_id": location_id, "is_default": True
    }
    r = customer_client.post(f"{API}/addresses", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_full_cod_checkout(customer_client, location_id, address_id):
    p = _get_product_for_loc(location_id)
    # get inventory before
    inv_before = requests.get(f"{API}/products/{p['id']}", params={"location_id": location_id}).json()["stock"]

    customer_client.delete(f"{API}/cart", params={"location_id": location_id})
    r = customer_client.post(f"{API}/cart/items", json={
        "product_id": p["id"], "location_id": location_id, "quantity": 3})
    assert r.status_code == 200

    # get today's slot
    from datetime import datetime
    import pytz
    ist = pytz.timezone("Asia/Kolkata")
    date = datetime.now(ist).strftime("%Y-%m-%d")
    slots_data = requests.get(f"{API}/delivery/slots", params={"location_id": location_id, "date": date}).json()
    avail = [s for s in slots_data["slots"] if s["available"]]
    if not avail:
        # try tomorrow
        from datetime import timedelta
        date = (datetime.now(ist) + timedelta(days=1)).strftime("%Y-%m-%d")
        slots_data = requests.get(f"{API}/delivery/slots", params={"location_id": location_id, "date": date}).json()
        avail = [s for s in slots_data["slots"] if s["available"]]
    assert avail, "No available slots"

    r = customer_client.post(f"{API}/orders", json={
        "location_id": location_id, "address_id": address_id,
        "delivery_type": "slot", "slot_id": avail[0]["id"], "payment_method": "cod"
    })
    assert r.status_code == 200, r.text
    order = r.json()
    assert order["status"] == "pending"
    assert order["payment_method"] == "cod"
    assert order["final_amount"] > 0
    assert order["slot_id"] == avail[0]["id"]

    # inventory decreased
    inv_after = requests.get(f"{API}/products/{p['id']}", params={"location_id": location_id}).json()["stock"]
    assert inv_after == inv_before - 3, f"Expected {inv_before - 3}, got {inv_after}"

    # cart cleared
    cart = customer_client.get(f"{API}/cart", params={"location_id": location_id}).json()
    assert cart["count"] == 0


def test_asap_order(customer_client, location_id, address_id):
    p = _get_product_for_loc(location_id)
    customer_client.delete(f"{API}/cart", params={"location_id": location_id})
    r = customer_client.post(f"{API}/cart/items", json={
        "product_id": p["id"], "location_id": location_id, "quantity": 2})
    assert r.status_code == 200

    from datetime import datetime
    import pytz
    ist = pytz.timezone("Asia/Kolkata")
    date = datetime.now(ist).strftime("%Y-%m-%d")
    slots_data = requests.get(f"{API}/delivery/slots", params={"location_id": location_id, "date": date}).json()
    if not slots_data.get("asap", {}).get("enabled"):
        pytest.skip("ASAP not currently available (outside window)")
    r = customer_client.post(f"{API}/orders", json={
        "location_id": location_id, "address_id": address_id,
        "delivery_type": "asap", "payment_method": "cod"
    })
    assert r.status_code == 200, r.text
    order = r.json()
    assert order["is_priority"] is True
    assert order["asap_charge"] == 100


# ---------- Order admin transitions ----------
def test_admin_order_status_cancelled_and_delivered(admin_client, customer_client, location_id, address_id):
    # create fresh order
    p = _get_product_for_loc(location_id)
    customer_client.delete(f"{API}/cart", params={"location_id": location_id})
    customer_client.post(f"{API}/cart/items", json={
        "product_id": p["id"], "location_id": location_id, "quantity": 2})
    from datetime import datetime, timedelta
    import pytz
    ist = pytz.timezone("Asia/Kolkata")
    for delta in [0, 1, 2]:
        date = (datetime.now(ist) + timedelta(days=delta)).strftime("%Y-%m-%d")
        slots = requests.get(f"{API}/delivery/slots", params={"location_id": location_id, "date": date}).json()
        avail = [s for s in slots["slots"] if s["available"]]
        if avail:
            break
    r = customer_client.post(f"{API}/orders", json={
        "location_id": location_id, "address_id": address_id,
        "delivery_type": "slot", "slot_id": avail[0]["id"], "payment_method": "cod"
    })
    assert r.status_code == 200
    order_id = r.json()["id"]

    stock_before_cancel = requests.get(f"{API}/products/{p['id']}", params={"location_id": location_id}).json()["stock"]
    # cancel -> stock restored
    r = admin_client.put(f"{API}/admin/orders/{order_id}/status", json={"status": "cancelled"})
    assert r.status_code == 200
    stock_after_cancel = requests.get(f"{API}/products/{p['id']}", params={"location_id": location_id}).json()["stock"]
    assert stock_after_cancel == stock_before_cancel + 2

    # New order to test delivered
    customer_client.post(f"{API}/cart/items", json={
        "product_id": p["id"], "location_id": location_id, "quantity": 1})
    r = customer_client.post(f"{API}/orders", json={
        "location_id": location_id, "address_id": address_id,
        "delivery_type": "slot", "slot_id": avail[0]["id"], "payment_method": "cod"
    })
    assert r.status_code == 200
    oid2 = r.json()["id"]
    r = admin_client.put(f"{API}/admin/orders/{oid2}/status", json={"status": "delivered"})
    assert r.status_code == 200
    updated = r.json()
    assert updated["status"] == "delivered"
    assert updated["payment_status"] == "paid"  # COD auto-paid on delivered


def test_admin_orders_list(admin_client):
    r = admin_client.get(f"{API}/admin/orders")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- Payments ----------
def test_payments_config():
    r = requests.get(f"{API}/payments/config")
    assert r.status_code == 200
    assert r.json()["razorpay_enabled"] is False


def test_razorpay_create_order_503(customer_client, location_id, address_id):
    # need an existing order to reference
    orders = customer_client.get(f"{API}/orders").json()
    assert orders, "Need an order to test"
    oid = orders[0]["id"]
    r = customer_client.post(f"{API}/payments/razorpay/create-order", json={"order_id": oid})
    assert r.status_code == 503


# ---------- Security ----------
def test_admin_endpoints_reject_customer(customer_client):
    endpoints = ["/admin/orders", "/admin/products", "/admin/customers",
                 "/admin/dashboard/stats", "/admin/coupons", "/admin/inventory"]
    for e in endpoints:
        r = customer_client.get(f"{API}{e}")
        assert r.status_code == 403, f"{e} returned {r.status_code}"


def test_admin_endpoints_unauth():
    for e in ["/admin/orders", "/admin/products", "/admin/customers", "/admin/dashboard/stats"]:
        r = requests.get(f"{API}{e}")
        assert r.status_code == 401, f"{e} returned {r.status_code}"


def test_customer_cannot_view_other_users_order(admin_client, location_id):
    # get any customer order via admin
    orders = admin_client.get(f"{API}/admin/orders").json()
    if not orders:
        pytest.skip("No orders")
    oid = orders[0]["id"]
    # create a fresh customer
    email = f"other_{uuid.uuid4().hex[:6]}@t.com"
    requests.post(f"{API}/auth/register", json={
        "name": "Other", "email": email, "phone": "1111111111", "password": "Pass@1234"})
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": email, "password": "Pass@1234"})
    r = s.get(f"{API}/orders/{oid}")
    assert r.status_code == 403


# ---------- Admin dashboard ----------
def test_dashboard_stats(admin_client):
    r = admin_client.get(f"{API}/admin/dashboard/stats")
    assert r.status_code == 200
    d = r.json()
    for k in ["total_orders", "total_products", "total_customers", "total_locations"]:
        assert k in d


def test_admin_customers(admin_client):
    r = admin_client.get(f"{API}/admin/customers")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    if data:
        assert "order_count" in data[0]


# ---------- Inventory admin ----------
def test_admin_inventory_update(admin_client, location_id):
    inv = admin_client.get(f"{API}/admin/inventory", params={"location_id": location_id}).json()
    assert inv
    item = inv[0]
    r = admin_client.put(f"{API}/admin/inventory", json={
        "product_id": item["product_id"], "location_id": location_id,
        "available_quantity": 50, "low_stock_threshold": 5
    })
    assert r.status_code == 200
    assert r.json()["available_quantity"] == 50


# ---------- Settings ----------
def test_settings_public():
    r = requests.get(f"{API}/settings")
    assert r.status_code == 200
    assert "store_name" in r.json()


def test_admin_settings_toggle(admin_client):
    r = admin_client.put(f"{API}/admin/settings", json={"cod_enabled": True, "online_payment_enabled": False})
    assert r.status_code == 200
    assert r.json()["cod_enabled"] is True
    assert r.json()["online_payment_enabled"] is False
    # restore
    admin_client.put(f"{API}/admin/settings", json={"cod_enabled": True, "online_payment_enabled": True})
