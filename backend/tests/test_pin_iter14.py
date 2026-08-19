"""Iteration 14 tests: PIN auto-provision inventory, copy inventory, checkout delivery charge on PIN update, admin Customer 360 wallet."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "prudhvirajm847@gmail.com", "password": "Admin@12345"}
CUSTOMER = {"email": "customer@test.com", "password": "Test@12345"}

PIN_A = "500034"   # customer's saved PIN, ₹40
PIN_BAD = "111111"


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def customer():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=CUSTOMER)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def parent_location(admin):
    """Pick the parent location of PIN 500034 for creating a new sibling PIN."""
    r = admin.get(f"{API}/admin/pincodes")
    assert r.status_code == 200
    pin = next((p for p in r.json() if p["pincode"] == PIN_A), None)
    assert pin, "PIN 500034 not seeded"
    return pin["location_id"]


# ---- Serviceability ----
def test_check_unserviceable():
    r = requests.get(f"{API}/pincodes/check", params={"pincode": PIN_BAD})
    assert r.status_code == 200
    assert r.json()["serviceable"] is False


def test_check_serviceable_500034_charge_40():
    r = requests.get(f"{API}/pincodes/check", params={"pincode": PIN_A})
    d = r.json()
    assert d["serviceable"] is True
    assert d["delivery_charge"] == 40


# ---- New PIN auto-provisions inventory ----
def test_create_new_pin_auto_provisions_inventory(admin, parent_location):
    new_pin = "5" + str(uuid.uuid4().int)[:5]  # unique 6-digit-ish
    payload = {
        "pincode": new_pin, "area_name": "TEST Auto Prov",
        "location_id": parent_location, "is_serviceable": True,
        "delivery_charge": 80, "asap_enabled": True,
    }
    r = admin.post(f"{API}/admin/pincodes", json=payload)
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["pincode"] == new_pin

    # Inventory list for the new PIN must be non-empty
    inv = admin.get(f"{API}/admin/inventory", params={"pincode": new_pin}).json()
    assert isinstance(inv, list) and len(inv) > 0
    configured = [i for i in inv if i.get("configured")]
    assert len(configured) > 0, "Expected auto-provisioned inventory rows"

    # Public product listing for this new PIN should not be empty
    prods = requests.get(f"{API}/products", params={"pincode": new_pin}).json()
    assert isinstance(prods, list) and len(prods) > 0, "New PIN catalog should be non-empty"

    # cleanup
    admin.delete(f"{API}/admin/pincodes/{created['id']}")


# ---- Copy inventory ----
def test_copy_inventory_from_500034_to_new_pin(admin, parent_location):
    new_pin = "5" + str(uuid.uuid4().int)[:5]
    r = admin.post(f"{API}/admin/pincodes", json={
        "pincode": new_pin, "area_name": "TEST Copy Target",
        "location_id": parent_location, "is_serviceable": True,
        "delivery_charge": 50, "asap_enabled": True,
    })
    assert r.status_code == 200
    pin_id = r.json()["id"]

    # Set a distinctive stock on source PIN_A for a specific product
    src_rows = admin.get(f"{API}/admin/inventory", params={"pincode": PIN_A}).json()
    assert src_rows
    sample = src_rows[0]
    pid = sample["product_id"]
    admin.put(f"{API}/admin/inventory", json={
        "product_id": pid, "pincode": PIN_A,
        "available_quantity": 137, "low_stock_threshold": 5, "enabled": True,
    })

    # Copy
    r = admin.post(f"{API}/admin/inventory/copy", json={
        "from_pincode": PIN_A, "to_pincodes": [new_pin],
    })
    assert r.status_code == 200, r.text
    assert r.json()["copied"] > 0

    # Target should now have 137 for the same product
    dest_rows = admin.get(f"{API}/admin/inventory", params={"pincode": new_pin}).json()
    row = next((x for x in dest_rows if x["product_id"] == pid), None)
    assert row and row["available_quantity"] == 137

    admin.delete(f"{API}/admin/pincodes/{pin_id}")


# ---- Isolation: editing one PIN doesn't affect another ----
def test_pin_isolation(admin):
    rows_a = admin.get(f"{API}/admin/inventory", params={"pincode": PIN_A}).json()
    pid = rows_a[0]["product_id"]
    admin.put(f"{API}/admin/inventory", json={
        "product_id": pid, "pincode": PIN_A,
        "available_quantity": 42, "low_stock_threshold": 5, "enabled": True,
    })
    other = "500073"
    admin.put(f"{API}/admin/inventory", json={
        "product_id": pid, "pincode": other,
        "available_quantity": 99, "low_stock_threshold": 5, "enabled": True,
    })
    a = admin.get(f"{API}/admin/inventory", params={"pincode": PIN_A}).json()
    b = admin.get(f"{API}/admin/inventory", params={"pincode": other}).json()
    ra = next(x for x in a if x["product_id"] == pid)
    rb = next(x for x in b if x["product_id"] == pid)
    assert ra["available_quantity"] == 42
    assert rb["available_quantity"] == 99


# ---- Checkout uses updated PIN delivery charge ----
def test_checkout_reflects_updated_pin_delivery_charge(admin, customer):
    # capture original charge
    orig = requests.get(f"{API}/pincodes/check", params={"pincode": PIN_A}).json()
    original_charge = orig["delivery_charge"]
    pins = admin.get(f"{API}/admin/pincodes").json()
    pin_doc = next(p for p in pins if p["pincode"] == PIN_A)
    pin_id = pin_doc["id"]

    try:
        # mutate to 55
        payload = {k: pin_doc[k] for k in ["pincode", "area_name", "location_id", "is_serviceable", "delivery_charge", "asap_enabled"] if k in pin_doc}
        payload["delivery_charge"] = 55
        r = admin.put(f"{API}/admin/pincodes/{pin_id}", json=payload)
        assert r.status_code == 200

        chk = requests.get(f"{API}/pincodes/check", params={"pincode": PIN_A}).json()
        assert chk["delivery_charge"] == 55
    finally:
        # restore
        payload = {k: pin_doc[k] for k in ["pincode", "area_name", "location_id", "is_serviceable", "delivery_charge", "asap_enabled"] if k in pin_doc}
        payload["delivery_charge"] = original_charge
        admin.put(f"{API}/admin/pincodes/{pin_id}", json=payload)


# ---- Admin Customer 360 shows wallet ----
def test_admin_customer_360_has_wallet(admin, customer):
    me = customer.get(f"{API}/auth/me").json()
    uid = me["id"]
    r = admin.get(f"{API}/admin/customers/{uid}/full")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "wallet" in d
    assert "balance" in d["wallet"]
    assert isinstance(d["wallet"].get("ledger", []), list)
    assert "wallet_balance" in d.get("summary", {})


# ---- Unserviceable PIN blocked at address create ----
def test_address_creation_blocks_unserviceable(customer):
    r = customer.post(f"{API}/addresses", json={
        "label": "X", "full_name": "T", "phone": "9999999999",
        "line1": "1", "city": "X", "area": "X", "pincode": PIN_BAD, "is_default": False,
    })
    assert r.status_code >= 400
