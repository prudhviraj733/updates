import os, requests
from pymongo import MongoClient

def envval(k):
    for l in open('/app/backend/.env'):
        if l.startswith(k+'='):
            return l.split('=',1)[1].strip().strip('"').strip("'")

API = [l.split('=',1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + "/api"
db = MongoClient(envval("MONGO_URL"))[envval("DB_NAME")]

cust = requests.Session(); cust.post(f"{API}/auth/login", json={"email":"customer@test.com","password":"Test@12345"})
adm = requests.Session(); adm.post(f"{API}/auth/login", json={"email":"prudhvirajm847@gmail.com","password":"Admin@12345"})
uid = str(db.users.find_one({"email":"customer@test.com"})["_id"])

oid = "TEST-RZP-ONLINE-REFUND"
db.orders.delete_one({"id": oid}); db.returns.delete_many({"order_id": oid}); db.wallet_ledger.delete_many({"order_id": oid})
item = {"product_id":"c595a83f-2cc1-4bb4-9c86-652a8a758381","name":"Sona Masoori Rice","pack_size":"5kg",
        "image":"","quantity":1,"unit_price":100.0,"line_total":100.0,"cost_price":60}
# ONLINE order marked paid with a (fake) razorpay payment id -> should hit the Razorpay refund branch
db.orders.insert_one({"id":oid,"order_number":"RZPONL01","user_id":uid,"status":"delivered",
                      "payment_method":"online","payment_status":"paid","razorpay_payment_id":"pay_FAKENOTREAL",
                      "final_amount":100.0,"subtotal":100.0,"delivery_charge":0,"items":[item],
                      "status_history":[{"status":"delivered","at":"now"}],"pincode":"520003",
                      "location_id":"562020f5-a8e0-4c37-8034-23af80e8c0c1","customer_name":"Test Customer"})

dmg = [r for r in cust.get(f"{API}/returns/reasons").json() if r["label"]=="Damaged product"][0]["id"]
rid = cust.post(f"{API}/me/returns", json={"order_id":oid,"product_id":item["product_id"],"quantity":1,
        "type":"refund","reason_id":dmg,"photos":["http://x/a.jpg"]}).json()["id"]
adm.put(f"{API}/admin/returns/{rid}/status", json={"status":"refund_approved"})

bal0 = cust.get(f"{API}/me/wallet").json()["balance"]
r = adm.put(f"{API}/admin/returns/{rid}/status", json={"status":"refunded"})
print("online refund attempt status:", r.status_code, "| body:", r.text[:200])
# Real Razorpay API rejects the fake payment id -> our code raises 400 (proves online branch called the API, NOT wallet)
assert r.status_code == 400 and "Razorpay refund failed" in r.text
bal1 = cust.get(f"{API}/me/wallet").json()["balance"]
assert round(bal1-bal0,2) == 0.0, "wallet must NOT be credited for online-paid orders"
detail = adm.get(f"{API}/admin/returns/{rid}").json()
assert detail.get("refund") in (None, {}), "no refund block should be recorded on failure"

db.orders.delete_one({"id": oid}); db.returns.delete_many({"order_id": oid}); db.wallet_ledger.delete_many({"order_id": oid})
print("\nONLINE-path routing verified ✅  (online-paid orders call Razorpay refund API, wallet NOT touched)")
