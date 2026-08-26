import requests

API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip() + "/api"

def login(email, pw):
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": email, "password": pw}).raise_for_status()
    return s

def test_category_coupon_flow():
    admin = login("prudhvirajm847@gmail.com", "Admin@12345")
    cust = login("customer@test.com", "Test@12345")

    locations = cust.get(f"{API}/locations").json()
    # find a location+pincode that lists products
    loc = pin = prods = None
    for L in locations:
        for pc in (L.get("pincodes") or [None]):
            pr = cust.get(f"{API}/products", params={"pincode": pc, "location_id": L["id"]}).json()
            pr = pr if isinstance(pr, list) else pr.get("products", [])
            pr = [p for p in pr if (p.get("selling_price") or 0) > 0]
            if len(pr) >= 2:
                loc, pin, prods = L, pc, pr
                break
        if prods:
            break
    assert prods, "no serviceable products found"
    loc_id = loc["id"]

    cats = admin.get(f"{API}/categories").json()
    by_cat = {}
    for p in prods:
        by_cat.setdefault(p.get("category_id"), []).append(p)
    cat = next(c for c in cats if by_cat.get(c["id"]))
    other_cat = next((c for c in cats if c["id"] != cat["id"] and by_cat.get(c["id"])), None)
    target = by_cat[cat["id"]][0]
    other = by_cat[other_cat["id"]][0] if other_cat else None
    price = target["selling_price"]

    def clear():
        c = cust.get(f"{API}/cart", params={"location_id": loc_id, "pincode": pin}).json()
        for it in c.get("items", []):
            if it.get("product_id"):
                cust.delete(f"{API}/cart/items/{it['product_id']}", params={"location_id": loc_id, "pincode": pin})

    def add(pid, qty):
        return cust.post(f"{API}/cart/items", json={"product_id": pid, "location_id": loc_id, "pincode": pin, "quantity": qty})

    def setqty(pid, qty):
        return cust.put(f"{API}/cart/items/{pid}", json={"location_id": loc_id, "pincode": pin, "quantity": qty})

    def validate(code, subtotal):
        return cust.post(f"{API}/coupons/validate", json={"code": code, "location_id": loc_id, "subtotal": subtotal})

    # create category coupon: 20% off, min 300 category spend, max discount 100
    code = "CATTEST20"
    for c in admin.get(f"{API}/admin/coupons").json():
        if c["code"] in (code, "PLAINTEST10"):
            admin.delete(f"{API}/admin/coupons/{c['id']}")
    r = admin.post(f"{API}/admin/coupons", json={"code": code, "coupon_type": "product",
        "discount_type": "percentage", "discount_value": 20, "min_order_value": 300,
        "max_discount": 100, "is_active": True, "category_id": cat["id"]})
    assert r.status_code == 200 and r.json().get("category_id") == cat["id"], r.text

    clear()

    # CASE A: only other-category items -> reject
    if other:
        add(other["id"], 2)
        c = cust.get(f"{API}/cart", params={"location_id": loc_id, "pincode": pin}).json()
        r = validate(code, c["subtotal"])
        print("A other-only", r.status_code, r.json().get("detail"))
        assert r.status_code == 400
        clear()

    # CASE B: target-category below min -> reject 'add more'
    # ensure below 300
    qty_low = max(1, int(250 // price)) if price < 300 else 1
    add(target["id"], qty_low)
    c = cust.get(f"{API}/cart", params={"location_id": loc_id, "pincode": pin}).json()
    cat_sub = price * qty_low
    r = validate(code, c["subtotal"])
    print("B below-min cat_sub", cat_sub, r.status_code, r.json())
    if cat_sub < 300:
        assert r.status_code == 400 and "more" in r.json()["detail"].lower(), r.text

    # CASE C: raise to exceed min -> apply, capped at 100
    need = int(300 // price) + 1
    setqty(target["id"], need)
    c = cust.get(f"{API}/cart", params={"location_id": loc_id, "pincode": pin}).json()
    cat_sub = price * need
    r = validate(code, c["subtotal"])
    print("C above-min cat_sub", cat_sub, r.status_code, r.json())
    assert r.status_code == 200, r.text
    j = r.json()
    expected = min(round(cat_sub * 0.20, 2), 100)
    assert abs(j["discount"] - expected) < 0.01, (j["discount"], expected)
    assert j.get("category_name") == cat["name"]

    # CASE C2: tamper subtotal huge -> server still uses category subtotal (capped)
    r = validate(code, 999999)
    print("C2 tamper discount", r.json().get("discount"))
    assert r.status_code == 200 and abs(r.json()["discount"] - expected) < 0.01

    # CASE C3: also add other-category items, discount unchanged (only category counts)
    if other:
        add(other["id"], 3)
        c = cust.get(f"{API}/cart", params={"location_id": loc_id, "pincode": pin}).json()
        r = validate(code, c["subtotal"])
        print("C3 mixed cart discount", r.json().get("discount"))
        assert r.status_code == 200 and abs(r.json()["discount"] - expected) < 0.01

    # CASE D: regression cart-wide coupon still works
    plain = "PLAINTEST10"
    admin.post(f"{API}/admin/coupons", json={"code": plain, "coupon_type": "product",
        "discount_type": "fixed", "discount_value": 50, "min_order_value": 100, "is_active": True})
    c = cust.get(f"{API}/cart", params={"location_id": loc_id, "pincode": pin}).json()
    r = validate(plain, c["subtotal"])
    print("D cart-wide", r.status_code, r.json())
    assert r.status_code == 200 and r.json()["discount"] == 50 and r.json().get("category_id") is None

    # cleanup
    for cc in admin.get(f"{API}/admin/coupons").json():
        if cc["code"] in (code, plain):
            admin.delete(f"{API}/admin/coupons/{cc['id']}")
    clear()
    print("ALL CATEGORY COUPON CASES PASSED")


if __name__ == "__main__":
    test_category_coupon_flow()
