import requests, uuid, asyncio
from motor.motor_asyncio import AsyncIOMotorClient

API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip() + "/api"
MONGO = "mongodb://localhost:27017"; DB = "test_database"

def login(e, p):
    s = requests.Session(); s.post(f"{API}/auth/login", json={"email": e, "password": p}).raise_for_status(); return s

def register(email):
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={"name": "Edge Tester", "email": email, "phone": "9876500000", "password": "Test@12345"})
    r.raise_for_status()
    return s

async def _cleanup_user(email):
    cli = AsyncIOMotorClient(MONGO); db = cli[DB]
    u = await db.users.find_one({"email": email})
    if u:
        uid = str(u["_id"])
        await db.orders.delete_many({"user_id": uid})
        await db.carts.delete_many({"user_id": uid})
        await db.users.delete_one({"_id": u["_id"]})
    cli.close()

def main():
    admin = login("prudhvirajm847@gmail.com", "Admin@12345")

    # setup: find serviceable location+pin with >=2 products
    locations = admin.get(f"{API}/locations").json()
    cust0 = login("customer@test.com", "Test@12345")
    loc = pin = prods = None
    for L in locations:
        for pc in (L.get("pincodes") or [None]):
            pr = cust0.get(f"{API}/products", params={"pincode": pc, "location_id": L["id"]}).json()
            pr = [p for p in (pr if isinstance(pr, list) else pr.get("products", [])) if (p.get("selling_price") or 0) > 0]
            if len(pr) >= 1:
                loc, pin, prods = L, pc, pr; break
        if prods: break
    loc_id = loc["id"]
    cats = admin.get(f"{API}/categories").json()
    by_cat = {}
    [by_cat.setdefault(p.get("category_id"), []).append(p) for p in prods]
    cat = next(c for c in cats if by_cat.get(c["id"]))
    target = by_cat[cat["id"]][0]; price = target["selling_price"]

    codes = {}
    def mkcoupon(**kw):
        code = "EDGE" + uuid.uuid4().hex[:6].upper()
        body = {"code": code, "coupon_type": "product", "discount_type": "fixed", "discount_value": 50,
                "min_order_value": 0, "is_active": True}
        body.update(kw)
        r = admin.post(f"{API}/admin/coupons", json=body)
        assert r.status_code == 200, r.text
        codes[code] = r.json()["id"]
        return code

    first_code = mkcoupon(first_order_only=True, discount_value=50)
    limit_code = mkcoupon(usage_limit=1, discount_value=25)
    pc_limit_code = mkcoupon(usage_limit_per_customer=1, discount_value=25)
    expired_code = mkcoupon(end_date="2020-01-01", discount_value=25)

    def avail(sess):
        return sess.get(f"{API}/coupons/available", params={"location_id": loc_id, "subtotal": 500, "pincode": pin}).json()

    def add_cart(sess, qty=1):
        sess.post(f"{API}/cart/items", json={"product_id": target["id"], "location_id": loc_id, "pincode": pin, "quantity": qty})

    def validate(sess, code):
        return sess.post(f"{API}/coupons/validate", json={"code": code, "location_id": loc_id, "subtotal": price})

    results = []

    # NEW customer (no orders) sees first-order coupon
    new_email = f"edge_{uuid.uuid4().hex[:8]}@test.com"
    newc = register(new_email)
    a = avail(newc)
    seen = {x["code"] for x in a}
    results.append(("new-customer sees first-order coupon", first_code in seen))
    results.append(("new-customer can validate first-order", validate(newc, first_code).status_code == 200))

    # EXISTING customer (has an order) must NOT see first-order coupon, and validate rejects
    ex_email = f"edge_ex_{uuid.uuid4().hex[:8]}@test.com"
    exc = register(ex_email)
    # give them a completed order by inserting one directly (non-cancelled)
    asyncio.get_event_loop().run_until_complete(_seed_order(ex_email, loc_id, pin))
    a2 = avail(exc)
    seen2 = {x["code"] for x in a2}
    results.append(("existing-customer does NOT see first-order coupon", first_code not in seen2))
    vr = validate(exc, first_code)
    results.append(("existing-customer validate first-order rejected 400", vr.status_code == 400 and "first order" in vr.json()["detail"].lower()))

    # expired coupon hidden + validate rejects
    results.append(("expired coupon hidden from available", expired_code not in seen))
    er = validate(newc, expired_code)
    results.append(("expired coupon validate rejected", er.status_code == 400 and "expired" in er.json()["detail"].lower()))

    # per-customer limit: after 1 non-cancelled order using it, hidden + rejected
    asyncio.get_event_loop().run_until_complete(_seed_order(ex_email, loc_id, pin, coupon_code=pc_limit_code))
    a3 = avail(exc)
    results.append(("per-customer-limit coupon hidden after use", pc_limit_code not in {x["code"] for x in a3}))
    pr = validate(exc, pc_limit_code)
    results.append(("per-customer-limit validate rejected", pr.status_code == 400))

    # global usage limit reached (1) -> hidden for everyone + rejected
    asyncio.get_event_loop().run_until_complete(_seed_order(ex_email, loc_id, pin, coupon_code=limit_code))
    a4 = avail(newc)
    results.append(("global-limit coupon hidden after limit reached", limit_code not in {x["code"] for x in a4}))
    gr = validate(newc, limit_code)
    results.append(("global-limit validate rejected", gr.status_code == 400))

    # visibility vs eligibility: general min-order coupon shown but not eligible with small cart
    minc = mkcoupon(min_order_value=99999, discount_value=50)
    a5 = avail(newc)
    entry = next((x for x in a5 if x["code"] == minc), None)
    results.append(("min-order coupon VISIBLE but not eligible", entry is not None and entry["eligible"] is False and "more" in entry["reason"].lower()))

    # cleanup
    for cid in codes.values():
        admin.delete(f"{API}/admin/coupons/{cid}")
    asyncio.get_event_loop().run_until_complete(_cleanup_user(new_email))
    asyncio.get_event_loop().run_until_complete(_cleanup_user(ex_email))

    print("\n=== EDGE CASE RESULTS ===")
    allok = True
    for name, ok in results:
        print(("PASS" if ok else "FAIL"), name)
        allok = allok and ok
    print("\nALL PASS" if allok else "\nSOME FAILED")

async def _seed_order(email, loc_id, pin, coupon_code=None):
    cli = AsyncIOMotorClient(MONGO); db = cli[DB]
    u = await db.users.find_one({"email": email}); uid = str(u["_id"])
    doc = {"id": str(uuid.uuid4()), "order_number": "EDGE"+uuid.uuid4().hex[:6], "user_id": uid,
           "location_id": loc_id, "pincode": pin, "status": "delivered", "items": [],
           "final_amount": 500, "created_at": "2026-01-01T00:00:00"}
    if coupon_code:
        doc["coupon_code"] = coupon_code
    await db.orders.insert_one(doc)
    cli.close()

if __name__ == "__main__":
    main()
