import requests, uuid, asyncio
from motor.motor_asyncio import AsyncIOMotorClient

API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip() + "/api"
MONGO = "mongodb://localhost:27017"; DB = "test_database"

def login(e, p):
    s = requests.Session(); s.post(f"{API}/auth/login", json={"email": e, "password": p}).raise_for_status(); return s

def is_pdf(r):
    return r.status_code == 200 and r.content[:4] == b"%PDF"

async def set_gst(**kw):
    cli = AsyncIOMotorClient(MONGO); db = cli[DB]
    await db.business_settings.update_one({"key": "global"}, {"$set": kw}, upsert=True); cli.close()

async def set_prod_gst(pid, rate):
    cli = AsyncIOMotorClient(MONGO); db = cli[DB]
    await db.products.update_one({"id": pid}, {"$set": {"gst_rate": rate}}); cli.close()

async def del_order(oid):
    cli = AsyncIOMotorClient(MONGO); db = cli[DB]
    await db.orders.delete_one({"id": oid}); await db.wallet_ledger.delete_many({"order_id": oid}); cli.close()

def first_slot(cust, loc_id):
    d = cust.get(f"{API}/delivery/slots/range", params={"days": 3, "location_id": loc_id}).json()
    for day in d.get("days", []):
        for s in day.get("slots", []):
            if s.get("available"): return s["id"]
    return None

def place(cust, loc_id, addr_id, coupon=None):
    body = {"location_id": loc_id, "address_id": addr_id, "delivery_type": "slot",
            "slot_id": first_slot(cust, loc_id), "payment_method": "cod", "coupon_code": coupon}
    return cust.post(f"{API}/orders", json=body)

def add(cust, pid, loc_id, pin, q):
    return cust.post(f"{API}/cart/items", json={"product_id": pid, "location_id": loc_id, "pincode": pin, "quantity": q})

def clear(cust, loc_id, pin):
    for it in cust.get(f"{API}/cart", params={"location_id": loc_id, "pincode": pin}).json().get("items", []):
        if it.get("product_id"): cust.delete(f"{API}/cart/items/{it['product_id']}", params={"location_id": loc_id, "pincode": pin})

def main():
    R = asyncio.get_event_loop().run_until_complete
    admin = login("prudhvirajm847@gmail.com", "Admin@12345")
    cust = login("customer@test.com", "Test@12345")
    locs = cust.get(f"{API}/locations").json()
    loc = pin = prods = None
    for L in locs:
        for pc in (L.get("pincodes") or [None]):
            pr = cust.get(f"{API}/products", params={"pincode": pc, "location_id": L["id"]}).json()
            pr = [p for p in (pr if isinstance(pr, list) else pr.get("products", [])) if (p.get("selling_price") or 0) > 0]
            if len(pr) >= 2: loc, pin, prods = L, pc, pr; break
        if prods: break
    loc_id = loc["id"]
    p1, p2 = prods[0], prods[1]
    addrs = cust.get(f"{API}/addresses").json()
    addr = next((a for a in addrs if a.get("pincode") == pin), None) or \
        cust.post(f"{API}/addresses", json={"label": "T", "full_name": "T", "phone": "9876543210", "line1": "1 St", "city": loc.get("city", "C"), "area": "", "pincode": pin, "location_id": loc_id}).json()
    addr_id = addr["id"]
    res = []
    made = []

    # baseline GST OFF
    R(set_gst(gst_enabled=False))
    R(set_prod_gst(p1["id"], 5)); R(set_prod_gst(p2["id"], 18))
    clear(cust, loc_id, pin); add(cust, p1["id"], loc_id, pin, 1)
    r = place(cust, loc_id, addr_id); o = r.json(); made.append(o.get("id"))
    off_final = o.get("final_amount")
    res.append(("GST OFF: gst.enabled False", o.get("gst", {}).get("enabled") is False))
    res.append(("GST OFF: no tax added", (o.get("gst", {}).get("total_tax") or 0) == 0))
    off_order_id = o["id"]

    # enable inclusive
    R(set_gst(gst_enabled=True, gst_pricing="inclusive", gstin="29ABCDE1234F1Z5", gst_default_rate=0))
    clear(cust, loc_id, pin); add(cust, p1["id"], loc_id, pin, 1)  # 5%
    r = place(cust, loc_id, addr_id); o = r.json(); made.append(o.get("id"))
    lt = o["items"][0]["line_total"]
    exp_taxable = round(lt * 100 / 105, 2); exp_tax = round(lt - exp_taxable, 2)
    res.append(("Inclusive 5%: total unchanged vs off (same item)", o["final_amount"] == off_final))
    res.append(("Inclusive 5%: embedded tax correct", abs(o["items"][0]["gst_amount"] - exp_tax) < 0.02 and o["gst"]["enabled"]))
    res.append(("Inclusive: gstin snapshot", o["gst"]["gstin"] == "29ABCDE1234F1Z5"))

    # multi-rate cart inclusive
    clear(cust, loc_id, pin); add(cust, p1["id"], loc_id, pin, 1); add(cust, p2["id"], loc_id, pin, 1)
    r = place(cust, loc_id, addr_id); o = r.json(); made.append(o.get("id"))
    rates = {b["rate"] for b in o["gst"]["by_rate"]}
    res.append(("Multi-rate: both 5 & 18 present", 5 in rates and 18 in rates))
    res.append(("Multi-rate: total_tax = sum of lines", abs(o["gst"]["total_tax"] - sum(i["gst_amount"] for i in o["items"])) < 0.05))

    # exclusive adds tax on top
    R(set_gst(gst_enabled=True, gst_pricing="exclusive"))
    clear(cust, loc_id, pin); add(cust, p2["id"], loc_id, pin, 1)  # 18%
    r = place(cust, loc_id, addr_id); o = r.json(); made.append(o.get("id"))
    exp_tax = round(o["subtotal"] * 18 / 100, 2)
    res.append(("Exclusive 18%: tax added to final", abs(o["final_amount"] - (o["subtotal"] + o["delivery_charge"] + exp_tax)) < 0.1))

    # API manipulation: client cannot inject gst (server ignores; recomputes)
    R(set_gst(gst_enabled=True, gst_pricing="inclusive"))
    clear(cust, loc_id, pin); add(cust, p1["id"], loc_id, pin, 1)
    body = {"location_id": loc_id, "address_id": addr_id, "delivery_type": "slot",
            "slot_id": first_slot(cust, loc_id), "payment_method": "cod",
            "gst": {"enabled": False, "total_tax": 9999}, "final_amount": 1}
    r = cust.post(f"{API}/orders", json=body); o = r.json(); made.append(o.get("id"))
    res.append(("API manipulation ignored (server recomputes gst)", o["gst"]["enabled"] is True and o["gst"]["total_tax"] != 9999 and o["final_amount"] != 1))

    # historical immutability: re-fetch the GST-OFF order after enabling GST
    ho = cust.get(f"{API}/orders/{off_order_id}").json()
    res.append(("Historical GST-OFF order still OFF after enabling", ho["gst"]["enabled"] is False and ho["final_amount"] == off_final))

    # PDF reflects GST when enabled, and OFF order PDF has no GST label
    res.append(("GST-enabled order PDF renders", is_pdf(cust.get(f"{API}/orders/{made[2]}/receipt"))))
    res.append(("GST-OFF order PDF renders", is_pdf(cust.get(f"{API}/orders/{off_order_id}/receipt"))))

    # cleanup: delete test orders, reset settings + product rates
    for oid in made:
        if oid: R(del_order(oid))
    R(set_gst(gst_enabled=False, gstin="", gst_pricing="inclusive"))
    R(set_prod_gst(p1["id"], 0)); R(set_prod_gst(p2["id"], 0))
    clear(cust, loc_id, pin)

    print("\n=== GST RESULTS ===")
    ok = True
    for n, v in res:
        print("PASS" if v else "FAIL", n); ok = ok and v
    print("\nALL PASS" if ok else "\nSOME FAILED")

if __name__ == "__main__":
    main()
