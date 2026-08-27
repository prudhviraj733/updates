import requests

API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip() + "/api"

def login(e, p):
    s = requests.Session(); s.post(f"{API}/auth/login", json={"email": e, "password": p}).raise_for_status(); return s

def is_pdf(r):
    return r.status_code == 200 and r.headers.get("content-type", "").startswith("application/pdf") and r.content[:4] == b"%PDF"

def main():
    admin = login("prudhvirajm847@gmail.com", "Admin@12345")
    cust = login("customer@test.com", "Test@12345")
    results = []

    orders = cust.get(f"{API}/orders").json()
    # historical/customer order receipt
    if orders:
        o = orders[0]
        r = cust.get(f"{API}/orders/{o['id']}/receipt")
        results.append(("customer order receipt inline PDF", is_pdf(r)))
        r2 = cust.get(f"{API}/orders/{o['id']}/receipt?download=1")
        results.append(("customer order receipt download disposition", is_pdf(r2) and "attachment" in r2.headers.get("content-disposition", "")))
        # admin can access same order
        ra = admin.get(f"{API}/orders/{o['id']}/receipt")
        results.append(("admin can access any order receipt", is_pdf(ra)))
        # find a COD and an online order if present
        cod = next((x for x in orders if (x.get("payment_method") or "") == "cod"), None)
        online = next((x for x in orders if (x.get("payment_method") or "") in ("online", "razorpay")), None)
        if cod:
            results.append(("COD order receipt", is_pdf(cust.get(f"{API}/orders/{cod['id']}/receipt"))))
        if online:
            results.append(("online/razorpay order receipt", is_pdf(cust.get(f"{API}/orders/{online['id']}/receipt"))))
        disc = next((x for x in orders if (x.get("coupon_discount") or 0) > 0), None)
        if disc:
            results.append(("discounted/coupon order receipt", is_pdf(cust.get(f"{API}/orders/{disc['id']}/receipt"))))
    else:
        results.append(("NO ORDERS to test (skipped)", True))

    # security: customer cannot access another customer's order
    all_admin_orders = admin.get(f"{API}/admin/orders").json()
    foreign = next((x for x in all_admin_orders if x.get("user_id") and x["user_id"] != _uid(cust)), None)
    if foreign:
        r = cust.get(f"{API}/orders/{foreign['id']}/receipt")
        results.append(("customer BLOCKED from foreign order receipt (403)", r.status_code == 403))

    # wallet receipt
    w = cust.get(f"{API}/me/wallet").json()
    led = [l for l in w.get("ledger", []) if l.get("txn_id")]
    if led:
        r = cust.get(f"{API}/wallet/receipt/{led[0]['txn_id']}")
        results.append(("customer wallet receipt PDF", is_pdf(r)))
    else:
        results.append(("NO wallet txns to test (skipped)", True))

    # refund receipt (find a refunded return)
    rets = cust.get(f"{API}/me/returns").json()
    refunded = next((x for x in rets if x.get("refund")), None)
    if refunded:
        results.append(("refund receipt PDF", is_pdf(cust.get(f"{API}/returns/{refunded['id']}/receipt"))))
    else:
        # confirm graceful 400 when no refund processed
        pending = next((x for x in rets if not x.get("refund")), None)
        if pending:
            r = cust.get(f"{API}/returns/{pending['id']}/receipt")
            results.append(("no-refund request returns 400 gracefully", r.status_code == 400))
        else:
            results.append(("NO returns to test (skipped)", True))

    # 404 for missing order
    results.append(("missing order -> 404", cust.get(f"{API}/orders/nope-xyz/receipt").status_code == 404))

    print("\n=== RECEIPT RESULTS ===")
    allok = True
    for n, ok in results:
        print("PASS" if ok else "FAIL", n); allok = allok and ok
    print("\nALL PASS" if allok else "\nSOME FAILED")

def _uid(sess):
    return sess.get(f"{API}/auth/me").json().get("id")

if __name__ == "__main__":
    main()
