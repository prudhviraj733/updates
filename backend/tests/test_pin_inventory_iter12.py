"""Backend tests for iteration 12: PIN codes + per-PIN delivery + per-PIN inventory."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://grocery-hub-1077.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "prudhvirajm847@gmail.com", "password": "Admin@12345"}
CUSTOMER = {"email": "customer@test.com", "password": "Test@12345"}
PIN_A = "500034"
PIN_B = "500073"
PIN_C = "500082"
PIN_BAD = "999999"


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


# ---- /pincodes/check ----
def test_pincode_check_serviceable_returns_charge():
    r = requests.get(f"{API}/pincodes/check", params={"pincode": PIN_A})
    assert r.status_code == 200
    d = r.json()
    assert d["serviceable"] is True
    assert d["pincode"] == PIN_A
    assert isinstance(d["delivery_charge"], (int, float))
    assert "asap_enabled" in d
    assert "min_order_value" in d
    assert d["location"]["id"]


def test_pincode_check_unserviceable():
    r = requests.get(f"{API}/pincodes/check", params={"pincode": PIN_BAD})
    assert r.status_code == 200
    assert r.json() == {"serviceable": False, "pincode": PIN_BAD}


# ---- Admin PIN CRUD ----
def test_admin_list_pincodes_contains_seeded(admin):
    r = admin.get(f"{API}/admin/pincodes")
    assert r.status_code == 200
    pins = {p["pincode"]: p for p in r.json()}
    for p in (PIN_A, PIN_B, PIN_C):
        assert p in pins, f"expected seeded PIN {p}"
        assert pins[p]["is_serviceable"] is True


# ---- Inventory summary + per-PIN listing ----
def test_inventory_summary_covers_all_pincodes(admin):
    r = admin.get(f"{API}/admin/inventory/summary")
    assert r.status_code == 200
    rows = {r_["pincode"]: r_ for r_ in r.json()}
    for p in (PIN_A, PIN_B, PIN_C):
        assert p in rows
        assert rows[p]["products_enabled"] >= 1


def test_inventory_listing_per_pin(admin):
    r = admin.get(f"{API}/admin/inventory", params={"pincode": PIN_A})
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) > 0
    # All rows must be scoped to PIN_A
    assert all(r_["pincode"] == PIN_A for r_ in rows)
    assert any(r_["enabled"] and r_["available_quantity"] > 0 for r_ in rows)


# ---- PIN inventory ISOLATION ----
def test_pin_inventory_isolation_between_pins(admin):
    a_rows = admin.get(f"{API}/admin/inventory", params={"pincode": PIN_A}).json()
    # pick an enabled product available in both PINs
    b_rows = {r_["product_id"]: r_ for r_ in admin.get(f"{API}/admin/inventory", params={"pincode": PIN_B}).json()}
    pid = None
    for r_ in a_rows:
        if r_["enabled"] and r_["product_id"] in b_rows and b_rows[r_["product_id"]]["enabled"]:
            pid = r_["product_id"]
            break
    assert pid, "no common enabled product across PIN_A & PIN_B"
    a_before = next(r_ for r_ in a_rows if r_["product_id"] == pid)["available_quantity"]
    b_before = b_rows[pid]["available_quantity"]

    # Set PIN_A stock to a distinct value
    target_a = 42
    r = admin.put(f"{API}/admin/inventory", json={
        "product_id": pid, "pincode": PIN_A, "available_quantity": target_a,
        "low_stock_threshold": 5, "enabled": True,
    })
    assert r.status_code == 200, r.text

    a_after = {r_["product_id"]: r_ for r_ in
               admin.get(f"{API}/admin/inventory", params={"pincode": PIN_A}).json()}[pid]["available_quantity"]
    b_after = {r_["product_id"]: r_ for r_ in
               admin.get(f"{API}/admin/inventory", params={"pincode": PIN_B}).json()}[pid]["available_quantity"]
    assert a_after == target_a
    assert b_after == b_before, f"PIN_B stock changed from {b_before}->{b_after} unexpectedly!"

    # restore
    admin.put(f"{API}/admin/inventory", json={
        "product_id": pid, "pincode": PIN_A, "available_quantity": a_before,
        "low_stock_threshold": 5, "enabled": True,
    })


# ---- Disable product for one PIN => hidden from /products?pincode= ----
def test_disable_product_hides_for_that_pin_only(admin):
    a_rows = admin.get(f"{API}/admin/inventory", params={"pincode": PIN_A}).json()
    pid = next(r_["product_id"] for r_ in a_rows if r_["enabled"] and r_["available_quantity"] > 0)

    # disable in PIN_A
    admin.put(f"{API}/admin/inventory", json={
        "product_id": pid, "pincode": PIN_A, "available_quantity": 100,
        "low_stock_threshold": 5, "enabled": False,
    })
    try:
        listed_a = {p["id"] for p in requests.get(f"{API}/products", params={"pincode": PIN_A}).json()}
        listed_b = {p["id"] for p in requests.get(f"{API}/products", params={"pincode": PIN_B}).json()}
        assert pid not in listed_a, "disabled product still shown for PIN_A"
        assert pid in listed_b, "disabling PIN_A affected PIN_B listing (isolation broken)"
    finally:
        admin.put(f"{API}/admin/inventory", json={
            "product_id": pid, "pincode": PIN_A, "available_quantity": 100,
            "low_stock_threshold": 5, "enabled": True,
        })


# ---- Enable-all bulk ----
def test_enable_all_for_single_pin(admin):
    r = admin.post(f"{API}/admin/inventory/enable-all",
                   json={"pincodes": [PIN_A], "enabled": True, "set_stock": None, "all_serviceable": False})
    assert r.status_code == 200, r.text
    d = r.json()
    assert PIN_A in d["pincodes"]
    assert d["rows_affected"] >= 1


def test_enable_all_serviceable(admin):
    r = admin.post(f"{API}/admin/inventory/enable-all",
                   json={"pincodes": [], "enabled": True, "set_stock": None, "all_serviceable": True})
    assert r.status_code == 200, r.text
    assert r.json()["rows_affected"] > 0


# ---- Checkout uses PIN's delivery charge ----
def _customer_address_pin(customer):
    r = customer.get(f"{API}/addresses")
    assert r.status_code == 200
    addrs = r.json()
    return next((a for a in addrs if (a.get("pincode") or "").strip() == PIN_A), addrs[0] if addrs else None)


def test_checkout_delivery_charge_matches_pin(admin, customer):
    addr = _customer_address_pin(customer)
    assert addr, "customer needs a saved address"
    pin = addr["pincode"].strip()
    pin_doc = next(p for p in admin.get(f"{API}/admin/pincodes").json() if p["pincode"] == pin)
    location_id = pin_doc["location_id"]

    # change PIN delivery charge to a unique value
    original_charge = pin_doc.get("delivery_charge", 0)
    new_charge = 77
    payload = {**pin_doc, "delivery_charge": new_charge}
    payload.pop("id", None); payload.pop("created_at", None); payload.pop("updated_at", None)
    r = admin.put(f"{API}/admin/pincodes/{pin_doc['id']}", json=payload)
    assert r.status_code == 200, r.text

    try:
        # verify via /pincodes/check
        chk = requests.get(f"{API}/pincodes/check", params={"pincode": pin}).json()
        assert chk["delivery_charge"] == new_charge

        # add an in-stock product available in PIN_A
        products = requests.get(f"{API}/products", params={"pincode": pin, "location_id": location_id}).json()
        prod = next((p for p in products if p.get("in_stock")), None)
        assert prod, "no in-stock product available for PIN_A"

        # clear cart then add
        cart = customer.get(f"{API}/cart", params={"location_id": location_id}).json()
        for it in cart.get("items", []):
            customer.delete(f"{API}/cart/items/{it['product_id']}", params={"location_id": location_id})

        r = customer.post(f"{API}/cart/items", json={
            "product_id": prod["id"], "quantity": 1, "location_id": location_id,
        })
        assert r.status_code == 200, r.text

        # place COD order (delivery_type asap to avoid slot booking)
        addrs = customer.get(f"{API}/addresses").json()
        addr_id = next(a["id"] for a in addrs if a.get("pincode") == pin)
        order_payload = {
            "location_id": location_id,
            "address_id": addr_id,
            "delivery_type": "asap",
            "payment_method": "cod",
            "use_wallet": False,
        }
        r = customer.post(f"{API}/orders", json=order_payload)
        assert r.status_code == 200, r.text
        order = r.json()
        assert order["delivery_charge"] == new_charge, f"expected {new_charge}, got {order['delivery_charge']}"
        assert order["asap_charge"] > 0, "ASAP surcharge should be additive"
        assert order["pincode"] == pin

        # inventory reserved: available should have decreased for that PIN
        inv = admin.get(f"{API}/admin/inventory", params={"pincode": pin}).json()
        row = next(r_ for r_ in inv if r_["product_id"] == prod["id"])
        assert row["reserved_quantity"] >= 1

        # cancel -> restore
        r = admin.put(f"{API}/admin/orders/{order['id']}/status", json={"status": "cancelled"})
        assert r.status_code == 200

        inv2 = admin.get(f"{API}/admin/inventory", params={"pincode": pin}).json()
        row2 = next(r_ for r_ in inv2 if r_["product_id"] == prod["id"])
        assert row2["reserved_quantity"] == row["reserved_quantity"] - 1
    finally:
        payload = {**pin_doc, "delivery_charge": original_charge}
        payload.pop("id", None); payload.pop("created_at", None); payload.pop("updated_at", None)
        admin.put(f"{API}/admin/pincodes/{pin_doc['id']}", json=payload)


# ---- Unserviceable PIN blocks order ----
def test_order_blocked_for_unserviceable_pin(admin, customer):
    # Create an address with bad pin
    r = customer.post(f"{API}/addresses", json={
        "full_name": "Bad", "line1": "x", "city": "y", "state": "z",
        "pincode": PIN_BAD, "phone": "9999999999", "location_id": "any",
    })
    # Server should reject creating an address on an unserviceable PIN
    if r.status_code == 400:
        assert "deliver" in r.json().get("detail", "").lower() or "pin" in r.json().get("detail", "").lower()
        return
    assert r.status_code == 200, f"unexpected address create status {r.status_code}: {r.text}"
    bad_id = r.json()["id"]
    try:
        # any location + empty cart -> checkout should fail early. Add one item first.
        addrs = customer.get(f"{API}/addresses").json()
        good = next(a for a in addrs if a.get("pincode") == PIN_A)
        location_id = next(p["location_id"] for p in admin.get(f"{API}/admin/pincodes").json() if p["pincode"] == PIN_A)
        products = requests.get(f"{API}/products", params={"pincode": PIN_A, "location_id": location_id}).json()
        prod = next(p for p in products if p.get("in_stock"))
        # ensure cart has item
        customer.post(f"{API}/cart/items", json={
            "product_id": prod["id"], "quantity": 1, "location_id": location_id,
        })
        r = customer.post(f"{API}/orders", json={
            "location_id": location_id, "address_id": bad_id,
            "delivery_type": "asap", "payment_method": "cod", "use_wallet": False,
        })
        assert r.status_code == 400
        assert "deliver" in r.json().get("detail", "").lower()
    finally:
        customer.delete(f"{API}/addresses/{bad_id}")
