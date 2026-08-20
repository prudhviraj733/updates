"""Edge cases found during iteration 16 UI review: refund amount validation."""
import io
import os

import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values("/app/frontend/.env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = BASE + "/api"
ORDER_ID = "TEST-RET-ORDER-1"
SONA = "c595a83f-2cc1-4bb4-9c86-652a8a758381"  # 620 x2


def _c(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=60)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def cust():
    return _c({"email": "customer@test.com", "password": "Test@12345"})


@pytest.fixture(scope="module")
def adm():
    return _c({"email": "prudhvirajm847@gmail.com", "password": "Admin@12345"})


class TestRefundAmountGuard:
    def test_refund_amount_cannot_exceed_line_amount(self, cust, adm):
        png = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                            "1f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082")
        up = cust.post(f"{API}/me/upload",
                       files={"file": ("TEST_e.png", io.BytesIO(png), "image/png")}, timeout=120)
        assert up.status_code == 200, up.text
        photo = up.json()["url"]
        reasons = cust.get(f"{API}/returns/reasons", timeout=60).json()
        rid_reason = next(r["id"] for r in reasons if r["label"] == "Damaged packaging")

        cr = cust.post(f"{API}/me/returns", json={
            "order_id": ORDER_ID, "product_id": SONA, "quantity": 1, "type": "refund",
            "reason_id": rid_reason, "photos": [photo]}, timeout=60)
        assert cr.status_code == 200, cr.text
        rid = cr.json()["id"]
        assert cr.json()["line_amount"] == 620

        before = cust.get(f"{API}/me/wallet", timeout=60).json()["balance"]
        over = adm.put(f"{API}/admin/returns/{rid}/status",
                       json={"status": "refunded", "refund_amount": 99999}, timeout=60)
        after = cust.get(f"{API}/me/wallet", timeout=60).json()["balance"]
        credited = round(after - before, 2)
        assert over.status_code == 400 or credited <= 620, (
            f"admin credited {credited} for a line amount of 620 (status {over.status_code}) "
            "-> no server-side cap on refund_amount")

    def test_negative_refund_amount_rejected(self, cust, adm):
        png = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                            "1f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082")
        photo = cust.post(f"{API}/me/upload",
                          files={"file": ("TEST_e2.png", io.BytesIO(png), "image/png")},
                          timeout=120).json()["url"]
        reasons = cust.get(f"{API}/returns/reasons", timeout=60).json()
        rid_reason = next(r["id"] for r in reasons if r["label"] == "Product quality issue")
        cr = cust.post(f"{API}/me/returns", json={
            "order_id": ORDER_ID, "product_id": SONA, "quantity": 1, "type": "refund",
            "reason_id": rid_reason, "photos": [photo]}, timeout=60)
        if cr.status_code == 400:
            pytest.skip("previous request still active for this item")
        rid = cr.json()["id"]
        before = cust.get(f"{API}/me/wallet", timeout=60).json()["balance"]
        r = adm.put(f"{API}/admin/returns/{rid}/status",
                    json={"status": "refunded", "refund_amount": -100}, timeout=60)
        after = cust.get(f"{API}/me/wallet", timeout=60).json()["balance"]
        assert r.status_code == 400 or after >= before, (
            f"negative refund debited the wallet: {before} -> {after}")
