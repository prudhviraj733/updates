import os, json, hmac, hashlib, time
import requests
from pymongo import MongoClient

def envval(k):
    for l in open('/app/backend/.env'):
        if l.startswith(k+'='):
            return l.split('=',1)[1].strip().strip('"').strip("'")

API = [l.split('=',1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL')][0] + "/api"
SECRET = envval("RAZORPAY_KEY_SECRET")
WEBHOOK_SECRET = envval("RAZORPAY_WEBHOOK_SECRET")
db = MongoClient(envval("MONGO_URL"))[envval("DB_NAME")]

s = requests.Session()
r = s.post(f"{API}/auth/login", json={"email": "customer@test.com", "password": "Test@12345"})
assert r.status_code == 200, r.text
uid = db.users.find_one({"email": "customer@test.com"})["_id"]
uid = str(uid)

# 1) config: key_id present, secret NEVER present
cfg = s.get(f"{API}/payments/config").json()
print("1) config:", cfg)
assert cfg["razorpay_enabled"] is True
assert cfg["razorpay_key_id"].startswith("rzp_test_")
assert SECRET not in json.dumps(cfg), "SECRET LEAKED in config!"

# seed a test order owned by the customer
oid = "TEST-RZP-ORDER"
db.orders.delete_one({"id": oid})
db.payments.delete_many({"order_id": oid})
db.orders.insert_one({"id": oid, "order_number": "RZPTEST01", "user_id": uid,
                      "status": "pending", "payment_method": "online", "payment_status": "pending",
                      "final_amount": 250.0, "items": [], "status_history": [{"status": "pending", "at": "now"}]})

# 2) create-order -> real Razorpay test API
r = s.post(f"{API}/payments/razorpay/create-order", json={"order_id": oid})
print("2) create-order status:", r.status_code)
assert r.status_code == 200, r.text
co = r.json()
print("   ->", co)
assert co["amount"] == 25000 and co["currency"] == "INR"
assert co["key_id"].startswith("rzp_test_")
assert SECRET not in r.text, "SECRET LEAKED in create-order!"
rzp_order_id = co["razorpay_order_id"]
assert rzp_order_id.startswith("order_")

# 3) verify FAILURE (bad signature) -> order marked failed, 400
r = s.post(f"{API}/payments/razorpay/verify", json={
    "razorpay_order_id": rzp_order_id, "razorpay_payment_id": "pay_FAKEFAIL",
    "razorpay_signature": "deadbeef"})
print("3) verify(bad sig) status:", r.status_code, r.json())
assert r.status_code == 400
assert db.orders.find_one({"id": oid})["payment_status"] == "failed"

# 4) verify SUCCESS (valid HMAC signature) -> paid + confirmed
pay_id = "pay_TESTOK123"
msg = f"{rzp_order_id}|{pay_id}"
good_sig = hmac.new(SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()
r = s.post(f"{API}/payments/razorpay/verify", json={
    "razorpay_order_id": rzp_order_id, "razorpay_payment_id": pay_id, "razorpay_signature": good_sig})
print("4) verify(good sig) status:", r.status_code, r.json())
assert r.status_code == 200 and r.json()["status"] == "paid"
o = db.orders.find_one({"id": oid})
assert o["payment_status"] == "paid" and o["status"] == "confirmed"
assert o["razorpay_payment_id"] == pay_id

# 5) webhook: invalid signature -> 400
bad_body = json.dumps({"event": "payment.captured"}).encode()
r = requests.post(f"{API}/payments/webhook", data=bad_body,
                  headers={"X-Razorpay-Signature": "wrong", "Content-Type": "application/json"})
print("5) webhook(bad sig) status:", r.status_code)
assert r.status_code == 400

# reset order to pending to test webhook-driven capture path independently
db.orders.update_one({"id": oid}, {"$set": {"payment_status": "pending", "status": "pending"}})

def signed_webhook(event_body: dict):
    body = json.dumps(event_body).encode()
    sig = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return requests.post(f"{API}/payments/webhook", data=body,
                         headers={"X-Razorpay-Signature": sig, "Content-Type": "application/json"})

# 6) webhook payment.captured -> paid + confirmed
evt = {"event": "payment.captured",
       "payload": {"payment": {"entity": {"id": "pay_WH1", "order_id": rzp_order_id}}}}
r = signed_webhook(evt)
print("6) webhook captured status:", r.status_code, r.json())
assert r.status_code == 200
o = db.orders.find_one({"id": oid})
assert o["payment_status"] == "paid" and o["status"] == "confirmed"

# 7) webhook idempotency: send captured again -> still one confirmed entry
before = len([h for h in db.orders.find_one({"id": oid})["status_history"] if h["status"] == "confirmed"])
signed_webhook(evt)
after = len([h for h in db.orders.find_one({"id": oid})["status_history"] if h["status"] == "confirmed"])
print(f"7) idempotency confirmed entries before={before} after={after}")
assert before == after, "webhook not idempotent!"

# 8) webhook payment.failed on a fresh pending order
db.orders.update_one({"id": oid}, {"$set": {"payment_status": "pending", "status": "pending",
                                            "status_history": [{"status": "pending", "at": "now"}]}})
evt_fail = {"event": "payment.failed",
            "payload": {"payment": {"entity": {"id": "pay_WHF", "order_id": rzp_order_id}}}}
r = signed_webhook(evt_fail)
print("8) webhook failed status:", r.status_code)
assert r.status_code == 200
assert db.orders.find_one({"id": oid})["payment_status"] == "failed"

# cleanup
db.orders.delete_one({"id": oid})
db.payments.delete_many({"order_id": oid})
print("\nALL RAZORPAY FLOW TESTS PASSED ✅  (secret never appeared in any response)")
