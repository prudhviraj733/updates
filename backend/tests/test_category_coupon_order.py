import requests, asyncio
from motor.motor_asyncio import AsyncIOMotorClient

API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip() + "/api"
MONGO = "mongodb://localhost:27017"; DB = "test_database"

def login(e, p):
    s = requests.Session(); s.post(f"{API}/auth/login", json={"email": e, "password": p}).raise_for_status(); return s

def run():
    admin = login("prudhvirajm847@gmail.com", "Admin@12345")
    cust = login("customer@test.com", "Test@12345")
    locations = cust.get(f"{API}/locations").json()
    loc = pin = prods = None
    for L in locations:
        for pc in (L.get("pincodes") or [None]):
            pr = cust.get(f"{API}/products", params={"pincode": pc, "location_id": L["id"]}).json()
            pr = [p for p in (pr if isinstance(pr, list) else pr.get("products", [])) if (p.get("selling_price") or 0) > 0]
            if len(pr) >= 2:
                loc, pin, prods = L, pc, pr; break
        if prods: break
    loc_id = loc["id"]
    cats = admin.get(f"{API}/categories").json()
    by_cat = {}
    [by_cat.setdefault(p.get("category_id"), []).append(p) for p in prods]
    cat = next(c for c in cats if by_cat.get(c["id"]))
    other_cat = next((c for c in cats if c["id"] != cat["id"] and by_cat.get(c["id"])), None)
    target = by_cat[cat["id"]][0]; other = by_cat[other_cat["id"]][0] if other_cat else None
    price = target["selling_price"]

    for c in admin.get(f"{API}/admin/coupons").json():
        if c["code"] == "CATORDER": admin.delete(f"{API}/admin/coupons/{c['id']}")
    admin.post(f"{API}/admin/coupons", json={"code": "CATORDER", "coupon_type": "product",
        "discount_type": "percentage", "discount_value": 10, "min_order_value": 100,
        "max_discount": None, "is_active": True, "category_id": cat["id"]})

    # clear + build mixed cart
    c = cust.get(f"{API}/cart", params={"location_id": loc_id, "pincode": pin}).json()
    for it in c.get("items", []):
        if it.get("product_id"): cust.delete(f"{API}/cart/items/{it['product_id']}", params={"location_id": loc_id, "pincode": pin})
    need = int(300 // price) + 1
    cust.post(f"{API}/cart/items", json={"product_id": target["id"], "location_id": loc_id, "pincode": pin, "quantity": need})
    if other:
        cust.post(f"{API}/cart/items", json={"product_id": other["id"], "location_id": loc_id, "pincode": pin, "quantity": 2})
    cat_sub = price * need
    expected = round(cat_sub * 0.10, 2)

    # need a serviceable address for this pin
    addrs = cust.get(f"{API}/addresses").json()
    addr = next((a for a in addrs if a.get("pincode") == pin), None)
    if not addr:
        r = cust.post(f"{API}/addresses", json={"label": "Test", "full_name": "Test C", "phone": "9876543210",
            "line1": "1 Test St", "city": loc.get("city", "City"), "area": loc.get("area", ""),
            "pincode": pin, "location_id": loc_id})
        addr = r.json()
    addr_id = addr["id"]

    # place COD order with category coupon
    r = cust.post(f"{API}/orders", json={"location_id": loc_id, "address_id": addr_id,
        "delivery_type": "slot", "slot_id": _first_slot(cust, loc_id), "payment_method": "cod",
        "coupon_code": "CATORDER"})
    print("ORDER", r.status_code, r.text[:300])
    ok = r.status_code == 200 and r.json().get("coupon_code") == "CATORDER" and abs(r.json()["coupon_discount"] - expected) < 0.01
    oid = r.json().get("id")

    # cleanup: cancel (restore inventory) + delete order doc + coupon
    if oid:
        cust_order = cust.get(f"{API}/orders/{oid}").json()
        admin.put(f"{API}/admin/orders/{oid}/status", json={"status": "cancelled"})
        asyncio.get_event_loop().run_until_complete(_del(oid))
    for c in admin.get(f"{API}/admin/coupons").json():
        if c["code"] == "CATORDER": admin.delete(f"{API}/admin/coupons/{c['id']}")
    c = cust.get(f"{API}/cart", params={"location_id": loc_id, "pincode": pin}).json()
    for it in c.get("items", []):
        if it.get("product_id"): cust.delete(f"{API}/cart/items/{it['product_id']}", params={"location_id": loc_id, "pincode": pin})
    print("ORDER CATEGORY COUPON:", "PASS" if ok else "FAIL")

def _first_slot(cust, loc_id):
    d = cust.get(f"{API}/delivery/slots/range", params={"days": 3, "location_id": loc_id}).json()
    for day in d.get("days", []):
        for s in day.get("slots", []):
            if s.get("available"): return s["id"]
    return None

async def _del(oid):
    cli = AsyncIOMotorClient(MONGO); db = cli[DB]
    await db.orders.delete_one({"id": oid})
    await db.wallet_ledger.delete_many({"order_id": oid})
    cli.close()

if __name__ == "__main__":
    run()
