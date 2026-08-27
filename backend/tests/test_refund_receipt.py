import requests, uuid, asyncio
from motor.motor_asyncio import AsyncIOMotorClient

API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip() + "/api"
MONGO = "mongodb://localhost:27017"; DB = "test_database"

def login(e, p):
    s = requests.Session(); s.post(f"{API}/auth/login", json={"email": e, "password": p}).raise_for_status(); return s

def is_pdf(r):
    return r.status_code == 200 and r.content[:4] == b"%PDF"

async def seed_refund(uid, order_number):
    cli = AsyncIOMotorClient(MONGO); db = cli[DB]
    rid = str(uuid.uuid4())
    doc = {"id": rid, "request_number": "RR" + uuid.uuid4().hex[:8].upper(),
           "order_id": "test-order", "order_number": order_number, "user_id": uid,
           "customer_name": "Test Cust", "product_name": "Basmati Rice 5kg", "quantity": 1,
           "unit_price": 699, "line_amount": 699, "type": "refund", "reason_label": "Damaged item",
           "status": "refunded",
           "refund": {"amount": 699, "reason": "Damaged item", "method": "wallet",
                      "reference_id": "WT-TEST", "at": "2026-06-01T10:00:00"},
           "created_at": "2026-06-01T09:00:00", "updated_at": "2026-06-01T10:00:00"}
    await db.returns.insert_one(doc); cli.close()
    return rid

async def del_return(rid):
    cli = AsyncIOMotorClient(MONGO); db = cli[DB]
    await db.returns.delete_one({"id": rid}); cli.close()

def main():
    cust = login("customer@test.com", "Test@12345")
    uid = cust.get(f"{API}/auth/me").json()["id"]
    rid = asyncio.get_event_loop().run_until_complete(seed_refund(uid, "FGTEST0001"))
    r = cust.get(f"{API}/returns/{rid}/receipt")
    ok = is_pdf(r)
    print("refund receipt PDF:", "PASS" if ok else "FAIL", r.status_code)
    if ok:
        open("/tmp/refund_receipt.pdf", "wb").write(r.content)
    # save one order receipt for visual check
    orders = cust.get(f"{API}/orders").json()
    if orders:
        ro = cust.get(f"{API}/orders/{orders[0]['id']}/receipt")
        if is_pdf(ro):
            open("/tmp/order_receipt.pdf", "wb").write(ro.content)
            print("saved /tmp/order_receipt.pdf")
    asyncio.get_event_loop().run_until_complete(del_return(rid))
    print("cleaned up synthetic return")

if __name__ == "__main__":
    main()
