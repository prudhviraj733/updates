"""Tests for iteration 2 features: image upload, slots/range, next-day COD, notifications non-blocking."""
import io
import os
import struct
import uuid
import zlib
from datetime import datetime, timedelta

import pytest
import pytz
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://grocery-hub-1077.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "prudhvirajm847@gmail.com"
ADMIN_PASS = "Admin@12345"
IST = pytz.timezone("Asia/Kolkata")


def _make_png_bytes() -> bytes:
    """Create a minimal 1x1 PNG."""
    sig = b"\x89PNG\r\n\x1a\n"
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    raw = b"\x00\xff\x00\x00"
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture(scope="session")
def admin_client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="session")
def customer_client():
    email = f"nf_cust_{uuid.uuid4().hex[:8]}@test.com"
    password = "Test@12345"
    r = requests.post(f"{API}/auth/register", json={
        "name": "NF Cust", "email": email, "phone": "9999999999", "password": password})
    assert r.status_code == 200
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200
    return s


@pytest.fixture(scope="session")
def location_id():
    r = requests.get(f"{API}/locations")
    assert r.status_code == 200
    return r.json()[0]["id"]


# ---------------- Uploads ----------------
def test_upload_requires_auth():
    r = requests.post(f"{API}/admin/upload",
                      files={"file": ("t.png", _make_png_bytes(), "image/png")})
    assert r.status_code == 401


def test_upload_forbidden_for_customer(customer_client):
    r = customer_client.post(f"{API}/admin/upload",
                             files={"file": ("t.png", _make_png_bytes(), "image/png")})
    assert r.status_code == 403


def test_upload_rejects_non_image(admin_client):
    r = admin_client.post(f"{API}/admin/upload",
                          files={"file": ("t.txt", b"hello", "text/plain")})
    assert r.status_code == 400


def test_upload_and_serve(admin_client):
    png = _make_png_bytes()
    r = admin_client.post(f"{API}/admin/upload",
                          files={"file": ("t.png", png, "image/png")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "url" in body and "path" in body
    assert body["url"].endswith(f"/api/files/{body['path']}")
    # Public GET
    r2 = requests.get(f"{API}/files/{body['path']}")
    assert r2.status_code == 200
    assert r2.headers.get("content-type", "").startswith("image/")
    assert len(r2.content) > 0


# ---------------- Slots range ----------------
def test_slots_range(location_id):
    r = requests.get(f"{API}/delivery/slots/range",
                     params={"location_id": location_id, "days": 4})
    assert r.status_code == 200
    data = r.json()
    assert "days" in data
    days = data["days"]
    assert len(days) == 4
    today = datetime.now(IST).strftime("%Y-%m-%d")
    assert days[0]["date"] == today
    # Later days should have full slot list
    assert len(days[1]["slots"]) > 0
    # Tomorrow slots should all be available (no past_leadtime for entire day)
    tomorrow_avail = [s for s in days[1]["slots"] if s["available"]]
    assert len(tomorrow_avail) > 0, "Tomorrow should have available slots"
    # ASAP should not be enabled for future days
    assert days[1]["asap"]["enabled"] is False


# ---------------- Next-day COD checkout ----------------
@pytest.fixture(scope="session")
def address_id(customer_client, location_id):
    r = customer_client.post(f"{API}/addresses", json={
        "label": "Home", "full_name": "Test", "phone": "9999999999",
        "line1": "1 Test St", "city": "Hyderabad", "pincode": "500034",
        "location_id": location_id, "is_default": True
    })
    assert r.status_code == 200
    return r.json()["id"]


def test_next_day_cod_checkout(customer_client, location_id, address_id):
    r = requests.get(f"{API}/products", params={"location_id": location_id})
    p = r.json()[0]
    customer_client.delete(f"{API}/cart", params={"location_id": location_id})
    r = customer_client.post(f"{API}/cart/items", json={
        "product_id": p["id"], "location_id": location_id, "quantity": 1})
    assert r.status_code == 200

    # tomorrow slot
    tomorrow = (datetime.now(IST) + timedelta(days=1)).strftime("%Y-%m-%d")
    slots = requests.get(f"{API}/delivery/slots",
                        params={"location_id": location_id, "date": tomorrow}).json()
    avail = [s for s in slots["slots"] if s["available"]]
    assert avail, "No tomorrow slots"
    chosen = avail[0]

    r = customer_client.post(f"{API}/orders", json={
        "location_id": location_id, "address_id": address_id,
        "delivery_type": "slot", "slot_id": chosen["id"], "payment_method": "cod"
    })
    assert r.status_code == 200, r.text
    order = r.json()
    assert order["slot_id"] == chosen["id"]
    assert order.get("slot_label") == chosen["label"], f"slot_label mismatch: {order.get('slot_label')} vs {chosen['label']}"
    assert order["status"] == "pending"


# ---------------- Notifications non-blocking ----------------
def test_order_create_and_status_update_do_not_fail_on_notify(admin_client, customer_client, location_id, address_id):
    r = requests.get(f"{API}/products", params={"location_id": location_id})
    p = r.json()[0]
    customer_client.delete(f"{API}/cart", params={"location_id": location_id})
    customer_client.post(f"{API}/cart/items", json={
        "product_id": p["id"], "location_id": location_id, "quantity": 1})
    tomorrow = (datetime.now(IST) + timedelta(days=1)).strftime("%Y-%m-%d")
    slots = requests.get(f"{API}/delivery/slots",
                        params={"location_id": location_id, "date": tomorrow}).json()
    avail = [s for s in slots["slots"] if s["available"]]
    r = customer_client.post(f"{API}/orders", json={
        "location_id": location_id, "address_id": address_id,
        "delivery_type": "slot", "slot_id": avail[0]["id"], "payment_method": "cod"
    })
    # Order create must not 500 (email/sms best-effort)
    assert r.status_code == 200, r.text
    oid = r.json()["id"]

    for s in ["confirmed", "preparing", "out_for_delivery", "delivered"]:
        r = admin_client.put(f"{API}/admin/orders/{oid}/status", json={"status": s})
        assert r.status_code == 200, f"status {s} failed: {r.text}"


# ---------------- Razorpay graceful ----------------
def test_payments_config():
    r = requests.get(f"{API}/payments/config")
    assert r.status_code == 200
    assert r.json()["razorpay_enabled"] is False


def test_razorpay_create_order_returns_503(customer_client, location_id, address_id):
    orders = customer_client.get(f"{API}/orders").json()
    if not orders:
        pytest.skip("No orders")
    r = customer_client.post(f"{API}/payments/razorpay/create-order",
                             json={"order_id": orders[0]["id"]})
    assert r.status_code == 503
