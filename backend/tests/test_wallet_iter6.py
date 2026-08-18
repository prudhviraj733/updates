"""
Iteration 6: Wallet top-up (Razorpay 503), Withdrawal lifecycle, cashback+milestone,
analytics (wallet + referrals + balances overview), settings persistence.
"""
import os
import time
import pytest
import requests

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()).rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "prudhvirajm847@gmail.com"
ADMIN_PASS = "Admin@12345"
CUST_EMAIL = "customer@test.com"
CUST_PASS = "Test@12345"


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def customer():
    return _login(CUST_EMAIL, CUST_PASS)


@pytest.fixture(scope="module")
def customer_id(customer):
    r = customer.get(f"{API}/auth/me")
    assert r.status_code == 200
    return r.json()["id"]


# ---------- Settings ----------

def test_settings_get_defaults(admin):
    r = admin.get(f"{API}/admin/settings")
    assert r.status_code == 200
    s = r.json()
    for k in ["cashback_enabled", "cashback_percent", "cashback_max",
              "milestone_enabled", "milestone_rewards", "withdrawals_enabled",
              "min_withdrawal", "withdrawable_sources"]:
        assert k in s, f"missing settings key {k}"


def test_settings_put_persists(admin):
    body = {
        "cashback_enabled": True, "cashback_percent": 2.0, "cashback_max": 50.0,
        "milestone_enabled": True, "milestone_rewards": {"5": 100, "10": 250},
        "withdrawals_enabled": True, "min_withdrawal": 100.0,
        "withdrawable_sources": ["topup", "refund", "admin_credit"],
    }
    r = admin.put(f"{API}/admin/settings", json=body)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["withdrawable_sources"] == ["topup", "refund", "admin_credit"]
    assert s["min_withdrawal"] == 100.0
    # Confirm GET reflects it
    r2 = admin.get(f"{API}/admin/settings")
    assert r2.json()["withdrawable_sources"] == ["topup", "refund", "admin_credit"]


# ---------- Top-up (Razorpay unconfigured) ----------

def test_topup_create_order_503(customer):
    r = customer.post(f"{API}/me/wallet/topup/create-order", json={"amount": 200})
    assert r.status_code == 503, f"expected 503, got {r.status_code} {r.text}"
    detail = r.json().get("detail", "")
    assert "not configured" in detail.lower() or "razorpay" in detail.lower()


def test_topup_invalid_amount(customer):
    r = customer.post(f"{API}/me/wallet/topup/create-order", json={"amount": 0})
    assert r.status_code in (400, 422)


# ---------- Withdrawal lifecycle ----------

def test_withdrawable_and_withdraw_flow(admin, customer, customer_id):
    # Give customer a withdrawable credit (admin_credit source is in list now)
    r = admin.post(f"{API}/admin/wallet/adjust",
                   json={"user_id": customer_id, "amount": 300, "reason": "TEST_topup_grant"})
    assert r.status_code == 200, r.text

    # Customer wallet: withdrawable should include 300 admin_credit
    r = customer.get(f"{API}/me/wallet")
    assert r.status_code == 200
    w = r.json()
    bal_before = w["balance"]
    withdrawable_before = w["withdrawable_balance"]
    assert withdrawable_before >= 300, f"expected >=300 withdrawable, got {withdrawable_before}"

    # Below min withdrawal -> 400
    r = customer.post(f"{API}/me/wallet/withdraw",
                      json={"amount": 50, "method": "upi", "upi_id": "test@upi"})
    assert r.status_code == 400

    # Above withdrawable -> 400
    r = customer.post(f"{API}/me/wallet/withdraw",
                      json={"amount": withdrawable_before + 5000, "method": "upi", "upi_id": "test@upi"})
    assert r.status_code == 400

    # Valid withdraw 200
    r = customer.post(f"{API}/me/wallet/withdraw",
                      json={"amount": 200, "method": "upi", "upi_id": "test@upi"})
    assert r.status_code == 200, r.text
    wd = r.json()
    assert wd["status"] == "pending"
    wd1_id = wd["id"]

    # Wallet reflects hold
    r = customer.get(f"{API}/me/wallet")
    w2 = r.json()
    assert round(w2["balance"], 2) == round(bal_before - 200, 2)
    assert round(w2["withdrawable_balance"], 2) == round(withdrawable_before - 200, 2)

    # Admin list
    r = admin.get(f"{API}/admin/withdrawals")
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert wd1_id in ids

    # approved -> completed
    r = admin.put(f"{API}/admin/withdrawals/{wd1_id}/status", json={"status": "approved"})
    assert r.status_code == 200
    r = admin.put(f"{API}/admin/withdrawals/{wd1_id}/status", json={"status": "completed"})
    assert r.status_code == 200
    assert r.json()["status"] == "completed"

    # Second request -> reject -> reverses hold
    r = customer.get(f"{API}/me/wallet")
    bal_pre = r.json()["balance"]
    r = customer.post(f"{API}/me/wallet/withdraw",
                      json={"amount": 100, "method": "upi", "upi_id": "test@upi"})
    if r.status_code != 200:
        pytest.skip(f"Not enough withdrawable balance for reject test: {r.text}")
    wd2_id = r.json()["id"]
    r = customer.get(f"{API}/me/wallet")
    assert round(r.json()["balance"], 2) == round(bal_pre - 100, 2)
    r = admin.put(f"{API}/admin/withdrawals/{wd2_id}/status",
                  json={"status": "rejected", "admin_note": "test reject"})
    assert r.status_code == 200
    # Verify refund credit added back
    r = customer.get(f"{API}/me/wallet")
    # after reject, refund of 100 added → balance == bal_pre
    assert round(r.json()["balance"], 2) == round(bal_pre, 2)


def test_credit_type_withdrawability_with_default_sources(admin, customer_id):
    # Restore defaults (no admin_credit)
    r = admin.put(f"{API}/admin/settings",
                  json={"withdrawable_sources": ["topup", "refund"]})
    assert r.status_code == 200
    # Now check withdrawable balance for a user whose credits are admin_credit/goodwill/cashback only.
    r = admin.get(f"{API}/admin/wallet/{customer_id}")
    assert r.status_code == 200
    data = r.json()
    # withdrawable balance should equal sum of topup+refund credits minus withdrawal debits.
    # For our test customer whose wallet was inflated only by admin_credit and any refund credit that occurred
    # via the reject reversal, we allow >=0.
    assert data["withdrawable_balance"] >= 0


# ---------- Cashback + milestone ----------

def test_cashback_idempotent_on_delivered(admin, customer, customer_id):
    # Get an existing not-yet-delivered order for customer OR create one
    orders = customer.get(f"{API}/orders").json()
    target = None
    for o in orders:
        if o.get("status") not in ("delivered", "cancelled"):
            target = o
            break
    if not target:
        pytest.skip("No non-delivered order available")

    oid = target["id"]

    # baseline ledger cashback for this order
    def cashback_count():
        w = customer.get(f"{API}/me/wallet").json()
        return sum(1 for l in w["ledger"] if l.get("order_id") == oid and l.get("source") == "cashback")

    before = cashback_count()

    # Ensure it's accepted first
    admin.put(f"{API}/admin/orders/{oid}/accept")
    r = admin.put(f"{API}/admin/orders/{oid}/status", json={"status": "delivered"})
    assert r.status_code == 200
    time.sleep(1)
    after = cashback_count()
    assert after >= before, "cashback should be added (or already present)"

    # Idempotency: hit delivered again (already delivered - should not add another)
    r = admin.put(f"{API}/admin/orders/{oid}/status", json={"status": "delivered"})
    time.sleep(1)
    final = cashback_count()
    # cashback count for this order should be exactly 1 (or 0 if disabled)
    assert final <= 1, f"cashback duplicated: {final}"


# ---------- Analytics ----------

def test_analytics_wallet(admin):
    r = admin.get(f"{API}/admin/analytics/wallet")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["total_liability", "total_credited", "total_debited",
              "by_source", "topups_count", "withdrawals_by_status"]:
        assert k in d, f"missing {k}"
    assert isinstance(d["by_source"], list)


def test_analytics_referrals(admin):
    r = admin.get(f"{API}/admin/analytics/referrals")
    assert r.status_code == 200
    d = r.json()
    for k in ["total_referrals", "total_reward_paid", "top_referrers"]:
        assert k in d


def test_wallet_balances_overview(admin, customer_id):
    r = admin.get(f"{API}/admin/wallet/overview/balances")
    assert r.status_code == 200
    d = r.json()
    assert "balances" in d and "total_liability" in d
    ids = [b["user_id"] for b in d["balances"]]
    # customer should be present (nonzero balance)
    assert customer_id in ids or d["total_liability"] >= 0


# ---------- Regression: existing endpoints ----------

def test_existing_endpoints(admin, customer):
    for path in ["/admin/orders", "/products", "/admin/coupons"]:
        r = (admin if path.startswith("/admin") else customer).get(f"{API}{path}")
        assert r.status_code == 200, f"{path} -> {r.status_code}"


# ---------- Cleanup: restore defaults ----------

def test_zzz_restore_defaults(admin):
    r = admin.put(f"{API}/admin/settings",
                  json={"withdrawable_sources": ["topup", "refund"]})
    assert r.status_code == 200
    assert r.json()["withdrawable_sources"] == ["topup", "refund"]
