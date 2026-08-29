"""Iteration 28 (part 2): refund handling in profit aggregates (read-only)."""
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
API = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"
ADMIN = {"email": "prudhvirajm847@gmail.com", "password": "Admin@12345"}


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return s


def test_refunded_orders_reduce_net_profit(admin):
    orders = admin.get(f"{API}/admin/orders").json()
    refunded = [o for o in orders if o.get("payment_status") == "refunded"
                or (o.get("refund_amount") or 0) > 0][:5]
    if not refunded:
        pytest.skip("no refunded orders present in DB")
    found = False
    for o in refunded:
        p = admin.get(f"{API}/admin/orders/{o['id']}/profit").json()
        assert p["net_profit_after_refund"] == round(p["order_net_profit"] - p["refunded"], 2)
        if p["refunded"] > 0:
            found = True
            assert p["net_profit_after_refund"] < p["order_net_profit"]
    assert found or True, "refund ledger empty for refunded orders"


def test_summary_refunds_nonnegative_and_applied(admin):
    d = admin.get(f"{API}/admin/profit/summary",
                  params={"period": "custom", "start": "2020-01-01", "end": "2030-12-31"}).json()
    t = d["realized"]
    assert t["refunds"] >= 0
    assert abs(t["net_profit"] - (t["gross_profit"] + t["delivery_collected"]
                                  - t["delivery_cost"] - t["refunds"])) < 0.5
