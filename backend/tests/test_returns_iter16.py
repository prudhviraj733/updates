"""Refund / Replacement feature tests (iteration 16).

Covers: reasons list (no change-of-mind), customer create validation/security,
duplicate guard, admin refund->wallet credit (idempotent/terminal), admin
replacement->PIN inventory reservation, reject flow, reasons CRUD, order integrity.
"""
import io
import os

import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values("/app/frontend/.env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = BASE + "/api"

ORDER_ID = "TEST-RET-ORDER-1"
CUST = {"email": "customer@test.com", "password": "Test@12345"}
ADMIN = {"email": "prudhvirajm847@gmail.com", "password": "Admin@12345"}

BANNED = ["don't want", "dont want", "changed my mind", "change of mind", "ordered by mistake",
          "don't like", "dont like", "no longer need", "found cheaper", "better price"]

# Items used by backend tests (index 2,3,4 of order) — index 0/1 left free for UI tests
KOLAM = "a9022134-18a8-45c9-bc01-d7fc2b0b2d00"      # 420 x2
TOOR = "f661723a-3fee-4fbd-ad91-60ae90abdbcc"       # 155 x2
MOONG = "8e1a16d9-a925-4312-8445-43a88adc0e3b"      # 139 x2


def _client(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"Login failed for {creds['email']}: {r.status_code} {r.text[:300]}")
    return s


@pytest.fixture(scope="module")
def cust():
    return _client(CUST)


@pytest.fixture(scope="module")
def adm():
    return _client(ADMIN)


@pytest.fixture(scope="module")
def reasons(cust):
    r = cust.get(f"{API}/returns/reasons", timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def photo_url(cust):
    """Real upload through /api/me/upload (object storage)."""
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082")
    files = {"file": ("TEST_evidence.png", io.BytesIO(png), "image/png")}
    r = cust.post(f"{API}/me/upload", files=files, timeout=120)
    assert r.status_code == 200, f"upload failed {r.status_code} {r.text[:300]}"
    url = r.json().get("url")
    assert url and "/api/files/" in url
    return url


def _reason(reasons, label):
    m = [r for r in reasons if r["label"] == label and r["is_active"]]
    assert m, f"reason '{label}' missing"
    return m[0]["id"]


# ==================== Reasons ====================
class TestReasons:
    def test_only_business_fault_reasons(self, reasons):
        assert len(reasons) >= 8
        labels = [r["label"].lower() for r in reasons]
        for bad in BANNED:
            assert not any(bad in l for l in labels), f"change-of-mind reason present: {bad}"
        for expected in ["Wrong product delivered", "Damaged product", "Damaged packaging",
                         "Product expired", "Product quality issue", "Other"]:
            assert expected in [r["label"] for r in reasons], expected
        assert all("_id" not in r for r in reasons)
        other = [r for r in reasons if r.get("is_other")]
        assert len(other) == 1 and other[0]["label"] == "Other"

    def test_reasons_require_auth(self):
        r = requests.get(f"{API}/returns/reasons", timeout=60)
        assert r.status_code in (401, 403)

    def test_admin_reasons_crud(self, adm, cust):
        created = adm.post(f"{API}/admin/return-reasons",
                           json={"label": "TEST_Seal broken on arrival", "is_active": True,
                                 "requires_photo": True}, timeout=60)
        assert created.status_code == 200, created.text
        doc = created.json()
        rid = doc["id"]
        assert doc["label"] == "TEST_Seal broken on arrival"
        assert doc["is_active"] is True and doc["requires_photo"] is True

        # visible to customer
        labels = [x["label"] for x in cust.get(f"{API}/returns/reasons", timeout=60).json()]
        assert "TEST_Seal broken on arrival" in labels

        # deactivate -> hidden from customer
        upd = adm.put(f"{API}/admin/return-reasons/{rid}",
                      json={"label": "TEST_Seal broken", "is_active": False, "requires_photo": False},
                      timeout=60)
        assert upd.status_code == 200, upd.text
        assert upd.json()["is_active"] is False and upd.json()["label"] == "TEST_Seal broken"
        labels2 = [x["label"] for x in cust.get(f"{API}/returns/reasons", timeout=60).json()]
        assert "TEST_Seal broken" not in labels2 and "TEST_Seal broken on arrival" not in labels2

        # persisted in admin list
        adm_rows = adm.get(f"{API}/admin/return-reasons", timeout=60).json()
        row = next(x for x in adm_rows if x["id"] == rid)
        assert row["is_active"] is False and row["requires_photo"] is False

    def test_admin_reason_404(self, adm):
        r = adm.put(f"{API}/admin/return-reasons/does-not-exist",
                    json={"label": "x", "is_active": True, "requires_photo": True}, timeout=60)
        assert r.status_code == 404

    def test_reason_admin_only(self, cust):
        r = cust.get(f"{API}/admin/return-reasons", timeout=60)
        assert r.status_code == 403


# ==================== Validation / security ====================
class TestCreateValidation:
    def test_photo_mandatory(self, cust, reasons):
        r = cust.post(f"{API}/me/returns", json={
            "order_id": ORDER_ID, "product_id": KOLAM, "quantity": 1, "type": "refund",
            "reason_id": _reason(reasons, "Damaged product"), "photos": []}, timeout=60)
        assert r.status_code == 400, r.text
        assert "Photo evidence is required" in r.json()["detail"]

    def test_other_requires_description(self, cust, reasons, photo_url):
        r = cust.post(f"{API}/me/returns", json={
            "order_id": ORDER_ID, "product_id": KOLAM, "quantity": 1, "type": "refund",
            "reason_id": _reason(reasons, "Other"), "photos": [photo_url], "description": "  "}, timeout=60)
        assert r.status_code == 400
        assert "explain" in r.json()["detail"].lower()

    def test_invalid_reason(self, cust, photo_url):
        r = cust.post(f"{API}/me/returns", json={
            "order_id": ORDER_ID, "product_id": KOLAM, "quantity": 1, "type": "refund",
            "reason_id": "bogus", "photos": [photo_url]}, timeout=60)
        assert r.status_code == 400 and "valid reason" in r.json()["detail"]

    def test_invalid_type(self, cust, reasons, photo_url):
        r = cust.post(f"{API}/me/returns", json={
            "order_id": ORDER_ID, "product_id": KOLAM, "quantity": 1, "type": "exchange",
            "reason_id": _reason(reasons, "Damaged product"), "photos": [photo_url]}, timeout=60)
        assert r.status_code in (400, 422)

    def test_item_not_in_order(self, cust, reasons, photo_url):
        r = cust.post(f"{API}/me/returns", json={
            "order_id": ORDER_ID, "product_id": "not-a-product", "quantity": 1, "type": "refund",
            "reason_id": _reason(reasons, "Damaged product"), "photos": [photo_url]}, timeout=60)
        assert r.status_code == 400 and "not part of the order" in r.json()["detail"]

    def test_foreign_order_403(self, cust, adm, reasons, photo_url):
        """Pick an order that belongs to somebody else -> 403."""
        orders = adm.get(f"{API}/admin/orders", timeout=60)
        assert orders.status_code == 200, orders.text
        rows = orders.json()
        rows = rows if isinstance(rows, list) else rows.get("orders", [])
        mine = {o["id"] for o in cust.get(f"{API}/orders", timeout=60).json()}
        foreign = next((o for o in rows if o["id"] not in mine), None)
        if not foreign:
            pytest.skip("no foreign order available")
        r = cust.post(f"{API}/me/returns", json={
            "order_id": foreign["id"], "product_id": KOLAM, "quantity": 1, "type": "refund",
            "reason_id": _reason(reasons, "Damaged product"), "photos": [photo_url]}, timeout=60)
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text[:200]}"

    def test_non_delivered_order_400(self, cust, reasons, photo_url):
        mine = cust.get(f"{API}/orders", timeout=60).json()
        nd = next((o for o in mine if o.get("status") != "delivered"), None)
        if not nd:
            pytest.skip("customer has no non-delivered order")
        item = nd["items"][0]["product_id"]
        r = cust.post(f"{API}/me/returns", json={
            "order_id": nd["id"], "product_id": item, "quantity": 1, "type": "refund",
            "reason_id": _reason(reasons, "Damaged product"), "photos": [photo_url]}, timeout=60)
        assert r.status_code == 400 and "delivered" in r.json()["detail"].lower()

    def test_unauthenticated_create(self, reasons, photo_url):
        r = requests.post(f"{API}/me/returns", json={
            "order_id": ORDER_ID, "product_id": KOLAM, "quantity": 1, "type": "refund",
            "reason_id": reasons[0]["id"], "photos": [photo_url]}, timeout=60)
        assert r.status_code in (401, 403)


# ==================== Refund flow ====================
class TestRefundFlow:
    def test_refund_end_to_end(self, cust, adm, reasons, photo_url):
        before = cust.get(f"{API}/me/wallet", timeout=60).json()["balance"]

        create = cust.post(f"{API}/me/returns", json={
            "order_id": ORDER_ID, "product_id": KOLAM, "quantity": 1, "type": "refund",
            "reason_id": _reason(reasons, "Damaged product"), "photos": [photo_url],
            "description": "TEST_backend refund"}, timeout=60)
        assert create.status_code == 200, create.text
        req = create.json()
        rid = req["id"]
        assert req["status"] == "requested"
        assert req["customer_status_label"] == "Requested"
        assert req["type"] == "refund" and req["quantity"] == 1
        assert req["line_amount"] == 420
        assert req["pincode"] == "520003"
        assert req["photos"] == [photo_url]
        assert "_id" not in req

        # persisted for the customer
        det = cust.get(f"{API}/me/returns/{rid}", timeout=60)
        assert det.status_code == 200 and det.json()["reason_label"] == "Damaged product"

        # duplicate guard
        dup = cust.post(f"{API}/me/returns", json={
            "order_id": ORDER_ID, "product_id": KOLAM, "quantity": 1, "type": "replacement",
            "reason_id": _reason(reasons, "Damaged packaging"), "photos": [photo_url]}, timeout=60)
        assert dup.status_code == 400
        assert "active request already exists" in dup.json()["detail"].lower()

        # admin sees it
        lst = adm.get(f"{API}/admin/returns", timeout=60)
        assert lst.status_code == 200
        assert rid in [x["id"] for x in lst.json()]
        assert rid in [x["id"] for x in adm.get(f"{API}/admin/returns?status=active", timeout=60).json()]

        # wrong-flow guard
        bad = adm.put(f"{API}/admin/returns/{rid}/status", json={"status": "replacement_approved"}, timeout=60)
        assert bad.status_code == 400 and "refund request" in bad.json()["detail"]
        assert adm.put(f"{API}/admin/returns/{rid}/status", json={"status": "bogus"}, timeout=60).status_code == 400

        # approve
        ap = adm.put(f"{API}/admin/returns/{rid}/status",
                     json={"status": "refund_approved", "note": "TEST_approved"}, timeout=60)
        assert ap.status_code == 200, ap.text
        assert ap.json()["status"] == "refund_approved"
        assert ap.json()["customer_status_label"] == "Refund Approved"
        assert any(n["note"] == "TEST_approved" for n in ap.json()["admin_notes"])

        # mark refunded -> wallet credit
        rf = adm.put(f"{API}/admin/returns/{rid}/status",
                     json={"status": "refunded", "refund_amount": 420}, timeout=60)
        assert rf.status_code == 200, rf.text
        body = rf.json()
        assert body["status"] == "refunded"
        assert body["refund"]["amount"] == 420
        assert body["refund"]["method"] == "wallet"
        assert body["refund"]["reference_id"]
        assert len(body["status_history"]) == 3

        after = cust.get(f"{API}/me/wallet", timeout=60).json()["balance"]
        assert round(after - before, 2) == 420.0, f"wallet {before} -> {after}"

        # terminal lock / idempotency
        again = adm.put(f"{API}/admin/returns/{rid}/status", json={"status": "refunded"}, timeout=60)
        assert again.status_code == 400 and "already" in again.json()["detail"].lower()
        assert cust.get(f"{API}/me/wallet", timeout=60).json()["balance"] == after

        # ledger entry
        led = cust.get(f"{API}/me/wallet", timeout=60).json()["ledger"]
        entry = next((l for l in led if l.get("source") == "refund" and req["request_number"] in (l.get("notes") or "")), None)
        assert entry and entry["amount"] == 420

        # new request allowed for same item once terminal
        again2 = cust.post(f"{API}/me/returns", json={
            "order_id": ORDER_ID, "product_id": KOLAM, "quantity": 1, "type": "refund",
            "reason_id": _reason(reasons, "Damaged product"), "photos": [photo_url]}, timeout=60)
        assert again2.status_code == 200, again2.text
        # leave terminal so the UI test is unaffected
        adm.put(f"{API}/admin/returns/{again2.json()['id']}/status", json={"status": "rejected"}, timeout=60)


# ==================== Replacement flow ====================
class TestReplacementFlow:
    def test_replacement_reserves_pin_inventory(self, cust, adm, reasons, photo_url):
        inv_before = adm.get(f"{API}/admin/inventory?product_id={TOOR}&pincode=520003", timeout=60)
        assert inv_before.status_code == 200, inv_before.text
        rows = inv_before.json()
        rows = rows if isinstance(rows, list) else rows.get("items", [])
        row = next((r for r in rows if r.get("product_id") == TOOR and str(r.get("pincode")) == "520003"), None)
        assert row, f"no PIN inventory row for {TOOR}/520003: {str(rows)[:300]}"
        avail0, res0 = row.get("available_quantity", 0), row.get("reserved_quantity", 0)

        create = cust.post(f"{API}/me/returns", json={
            "order_id": ORDER_ID, "product_id": TOOR, "quantity": 2, "type": "replacement",
            "reason_id": _reason(reasons, "Product leaked/spilled"), "photos": [photo_url]}, timeout=60)
        assert create.status_code == 200, create.text
        rid = create.json()["id"]
        assert create.json()["replacement"] == {"inventory_reserved": False}

        ap = adm.put(f"{API}/admin/returns/{rid}/status", json={"status": "replacement_approved"}, timeout=60)
        assert ap.status_code == 200, ap.text
        assert ap.json()["replacement"]["inventory_reserved"] is True

        def _row():
            d = adm.get(f"{API}/admin/inventory?product_id={TOOR}&pincode=520003", timeout=60).json()
            d = d if isinstance(d, list) else d.get("items", [])
            return next(r for r in d if r.get("product_id") == TOOR and str(r.get("pincode")) == "520003")

        r1 = _row()
        assert r1["available_quantity"] == avail0 - 2, f"{avail0} -> {r1['available_quantity']}"
        assert r1["reserved_quantity"] == res0 + 2

        assert adm.put(f"{API}/admin/returns/{rid}/status", json={"status": "refund_approved"},
                       timeout=60).status_code == 400

        for s in ["replacement_scheduled", "replacement_out_for_delivery", "replaced"]:
            r = adm.put(f"{API}/admin/returns/{rid}/status", json={"status": s}, timeout=60)
            assert r.status_code == 200, f"{s}: {r.text}"

        r2 = _row()
        assert r2["available_quantity"] == avail0 - 2
        assert r2["reserved_quantity"] == res0
        assert r2.get("sold_quantity", 0) == row.get("sold_quantity", 0) + 2

        assert adm.put(f"{API}/admin/returns/{rid}/status", json={"status": "replaced"},
                       timeout=60).status_code == 400


class TestRejectFlow:
    def test_reject_releases_and_locks(self, cust, adm, reasons, photo_url):
        create = cust.post(f"{API}/me/returns", json={
            "order_id": ORDER_ID, "product_id": MOONG, "quantity": 1, "type": "replacement",
            "reason_id": _reason(reasons, "Product expired"), "photos": [photo_url]}, timeout=60)
        assert create.status_code == 200, create.text
        rid = create.json()["id"]
        rej = adm.put(f"{API}/admin/returns/{rid}/status",
                      json={"status": "rejected", "note": "TEST_not eligible"}, timeout=60)
        assert rej.status_code == 200 and rej.json()["status"] == "rejected"
        assert any(n["note"] == "TEST_not eligible" for n in rej.json()["admin_notes"])
        assert adm.put(f"{API}/admin/returns/{rid}/status",
                       json={"status": "under_review"}, timeout=60).status_code == 400
        # customer sees Rejected label
        mine = cust.get(f"{API}/me/returns?order_id={ORDER_ID}", timeout=60).json()
        assert next(x for x in mine if x["id"] == rid)["customer_status_label"] == "Rejected"

    def test_admin_detail_404_and_auth(self, adm, cust):
        assert adm.get(f"{API}/admin/returns/nope", timeout=60).status_code == 404
        assert cust.get(f"{API}/admin/returns", timeout=60).status_code == 403
        assert requests.get(f"{API}/admin/returns", timeout=60).status_code in (401, 403)


# ==================== Order integrity ====================
class TestOrderIntegrity:
    def test_order_unchanged(self, cust):
        o = cust.get(f"{API}/orders/{ORDER_ID}", timeout=60)
        assert o.status_code == 200
        d = o.json()
        assert d["status"] == "delivered"
        assert len(d["items"]) == 5
        assert d["subtotal"] == 4066 and d["final_amount"] == 4106
