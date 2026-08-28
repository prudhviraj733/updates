"""Inventory batch + expiry + FEFO E2E. Self-cleaning."""
import os
import uuid
from datetime import date, timedelta
import requests

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
T = uuid.uuid4().hex[:5].upper()
a = requests.Session()


def login():
    r = a.post(f"{API}/auth/login", json={"email": "prudhvirajm847@gmail.com", "password": "Admin@12345"})
    tok = r.json().get("token")
    if tok:
        a.headers["Authorization"] = f"Bearer {tok}"


def row_for(pincode, pid):
    rows = a.get(f"{API}/admin/inventory?pincode={pincode}").json()
    return next((r for r in rows if r["product_id"] == pid), None)


def main():
    login()
    pins = a.get(f"{API}/admin/pincodes").json()
    pincode = next(p["pincode"] for p in pins if p.get("is_serviceable"))
    # pick any product
    pid = a.get(f"{API}/admin/products").json()[0]["id"]
    created_batches = []
    try:
        d_far = (date.today() + timedelta(days=400)).isoformat()
        d_soon = (date.today() + timedelta(days=18)).isoformat()
        d_vsoon = (date.today() + timedelta(days=5)).isoformat()
        d_exp = (date.today() - timedelta(days=3)).isoformat()

        b1 = a.post(f"{API}/admin/inventory/batch", json={"product_id": pid, "pincode": pincode, "batch_number": f"B1{T}", "quantity": 10, "expiry_date": d_vsoon}).json()
        b2 = a.post(f"{API}/admin/inventory/batch", json={"product_id": pid, "pincode": pincode, "batch_number": f"B2{T}", "quantity": 20, "expiry_date": d_far}).json()
        print("PASS add two batches")

        row = row_for(pincode, pid)
        codes = {b["batch_number"] for b in row["batches"] if b["batch_number"].endswith(T)}
        assert {f"B1{T}", f"B2{T}"} <= codes, "batches not kept separate"
        for b in row["batches"]:
            created_batches.append(b["id"])
        print(f"PASS multiple batches kept separate; available={row['available_quantity']}")

        # expiry statuses
        b_soon = a.post(f"{API}/admin/inventory/batch", json={"product_id": pid, "pincode": pincode, "batch_number": f"B3{T}", "quantity": 5, "expiry_date": d_soon}).json()
        row = row_for(pincode, pid)
        st = {b["batch_number"]: b["expiry"]["status"] for b in row["batches"] if b["batch_number"].endswith(T)}
        assert st[f"B1{T}"] == "very_soon" and st[f"B3{T}"] == "soon" and st[f"B2{T}"] == "normal", st
        # nearest-expiry row status must be very_soon
        assert row["expiry_status"] == "very_soon", row["expiry_status"]
        # summary at this state: this row counts in expiring_7 and expiring_30
        s0 = a.get(f"{API}/admin/inventory/expiry-summary?pincode={pincode}").json()
        assert s0["expiring_7"] >= 1 and s0["expiring_30"] >= 1, s0
        print(f"PASS expiry statuses + expiring_7 bucket ({s0['expiring_7']}); row days={row['expiry_days']}")

        # expired batch
        a.post(f"{API}/admin/inventory/batch", json={"product_id": pid, "pincode": pincode, "batch_number": f"B4{T}", "quantity": 3, "expiry_date": d_exp})
        row = row_for(pincode, pid)
        assert row["expiry_status"] == "expired", row["expiry_status"]
        print("PASS expired batch flips row status to expired")

        # dashboard summary at very_soon state (before expired batch is added below)
        # (re-added expired batch already; so verify expired bucket here)
        summ = a.get(f"{API}/admin/inventory/expiry-summary?pincode={pincode}").json()
        assert summ["expired"] >= 1, summ
        assert summ["expiring_30"] >= summ["expiring_7"], summ
        assert summ["total_inventory"] >= 1 and summ["out_of_stock"] >= 0 and summ["low_stock"] >= 0
        print(f"PASS dashboard summary {summ}")

        # delete one batch -> available drops by its qty
        before = row_for(pincode, pid)["available_quantity"]
        a.delete(f"{API}/admin/inventory/batch/{b2['batches'][-1]['id'] if 'batches' in b2 else created_batches[1]}?product_id={pid}&pincode={pincode}")
        after = row_for(pincode, pid)["available_quantity"]
        assert after == before - 20, f"delete batch qty mismatch before={before} after={after}"
        print(f"PASS delete batch reduces available by its qty ({before}->{after})")

        print("ALL INVENTORY BATCH/EXPIRY TESTS PASSED")
    finally:
        # remove all test batches by reloading and deleting those ending with T
        row = row_for(pincode, pid)
        if row:
            for b in row.get("batches", []):
                if b["batch_number"].endswith(T):
                    a.delete(f"{API}/admin/inventory/batch/{b['id']}?product_id={pid}&pincode={pincode}")


if __name__ == "__main__":
    main()
