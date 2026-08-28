"""Coupon visibility + analytics E2E. Self-cleaning."""
import os
import uuid
import requests

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
T = uuid.uuid4().hex[:5].upper()
PUB = f"PUB{T}"
PRIV = f"PRIV{T}"

admin = requests.Session()
cust = requests.Session()


def login(sess, email, pw):
    r = sess.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    tok = r.json().get("token")
    if tok:
        sess.headers["Authorization"] = f"Bearer {tok}"


def main():
    login(admin, "prudhvirajm847@gmail.com", "Admin@12345")
    login(cust, "customer@test.com", "Test@12345")
    loc = admin.get(f"{API}/locations").json()[0]["id"]
    ids = []
    try:
        pub = admin.post(f"{API}/admin/coupons", json={"code": PUB, "coupon_type": "product",
              "discount_type": "percentage", "discount_value": 10, "min_order_value": 0,
              "visibility": "public", "is_active": True}).json()
        ids.append(pub["id"])
        priv = admin.post(f"{API}/admin/coupons", json={"code": PRIV, "coupon_type": "product",
               "discount_type": "percentage", "discount_value": 10, "min_order_value": 0,
               "visibility": "private", "is_active": True}).json()
        ids.append(priv["id"])
        print("PASS create public + private coupons")

        # Default visibility on existing coupons should be public in analytics
        av = cust.get(f"{API}/coupons/available?location_id={loc}").json()
        codes = {c["code"] for c in av}
        assert PUB in codes, f"public coupon missing from available: {codes}"
        assert PRIV not in codes, "private coupon leaked into available list"
        print("PASS available list shows public, hides private")

        # Private coupon still validates by code
        vr = cust.post(f"{API}/coupons/validate", json={"code": PRIV, "location_id": loc, "subtotal": 0})
        assert vr.status_code == 200, f"private validate failed: {vr.text}"
        print("PASS private coupon works by code (apply logged)")

        # Invalid code apply attempt is logged as failure (still 404)
        bad = cust.post(f"{API}/coupons/validate", json={"code": PUB + "X", "location_id": loc, "subtotal": 0})
        assert bad.status_code == 404

        # Analytics dashboard includes both, with visibility + funnel fields
        an = admin.get(f"{API}/admin/coupons/analytics?range=30d").json()
        rows = {r["code"]: r for r in an["coupons"]}
        assert rows[PUB]["visibility"] == "public"
        assert rows[PRIV]["visibility"] == "private"
        assert rows[PUB]["views"] >= 1, "public coupon view not logged"
        assert an["totals"]["public_coupons"] >= 1 and an["totals"]["private_coupons"] >= 1
        print(f"PASS dashboard analytics (views logged: PUB views={rows[PUB]['views']})")

        # Per-coupon stats (private has an apply event)
        st = admin.get(f"{API}/admin/coupons/{priv['id']}/stats?range=30d").json()
        assert st["funnel"]["apply_attempts"] >= 1, "private apply not logged"
        assert st["funnel"]["successful_applications"] >= 1
        assert "conversion" in st and "totals" in st
        print(f"PASS private stats funnel apply={st['funnel']['apply_attempts']} ok={st['funnel']['successful_applications']}")

        # Usage history endpoint returns a list
        us = admin.get(f"{API}/admin/coupons/{pub['id']}/usage").json()
        assert "usage" in us and isinstance(us["usage"], list)
        print("PASS usage history endpoint")

        # Date range custom works
        an2 = admin.get(f"{API}/admin/coupons/analytics?range=today").json()
        assert "totals" in an2
        print("PASS date range filter")

        print("ALL COUPON VISIBILITY + ANALYTICS TESTS PASSED")
    finally:
        for cid in ids:
            admin.delete(f"{API}/admin/coupons/{cid}")
        # purge event log for the test codes
        # (no admin endpoint; leave events — harmless, tagged by unique code)


if __name__ == "__main__":
    main()
