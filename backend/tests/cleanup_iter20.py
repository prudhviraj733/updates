"""Cleanup of iteration-20 QA artifacts: TEST_ users, TEST_QA campaigns and their
notifications, leftover test cart, and cancellation of QA-created orders.

Usage: python /app/backend/tests/cleanup_iter20.py
"""
import asyncio
import os
import sys

import requests
from dotenv import dotenv_values, load_dotenv

sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

BASE = (dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE}/api"
QA_ORDERS = ["FG260800046", "FG260800047"]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # 1. Cancel QA orders via admin API (releases reserved inventory)
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": "prudhvirajm847@gmail.com",
                                      "password": "Admin@12345"}, timeout=30)
    for onum in QA_ORDERS:
        o = await db.orders.find_one({"order_number": onum}, {"id": 1, "status": 1, "_id": 0})
        if o and o["status"] not in ("cancelled", "delivered"):
            r = s.put(f"{API}/admin/orders/{o['id']}/status", json={"status": "cancelled"}, timeout=30)
            print(f"cancel {onum}: {r.status_code}")

    # 2. Remove TEST_ users created by the suite (and their notifications/carts)
    users = await db.users.find({"email": {"$regex": "^test_", "$options": "i"}},
                               {"_id": 1, "email": 1}).to_list(500)
    uids = [str(u["_id"]) for u in users]
    print("TEST_ users:", [u["email"] for u in users])
    if uids:
        await db.notifications.delete_many({"user_id": {"$in": uids}})
        await db.carts.delete_many({"user_id": {"$in": uids}})
        await db.addresses.delete_many({"user_id": {"$in": uids}})
        await db.users.delete_many({"_id": {"$in": [u["_id"] for u in users]}})
    await db.login_attempts.delete_many({"identifier": {"$regex": "acct:test_", "$options": "i"}})

    # 3. Remove QA notification campaigns + their per-user notifications
    camps = await db.notification_campaigns.find({"title": {"$regex": "^TEST_QA"}},
                                                 {"id": 1, "_id": 0}).to_list(500)
    cids = [c["id"] for c in camps]
    if cids:
        await db.notifications.delete_many({"campaign_id": {"$in": cids}})
        await db.notification_campaigns.delete_many({"id": {"$in": cids}})
    print("removed campaigns:", len(cids))

    # 4. Clear the shared test customer's cart + delete QA addresses
    cust = await db.users.find_one({"email": "customer@test.com"}, {"_id": 1})
    if cust:
        await db.carts.update_many({"user_id": str(cust["_id"])}, {"$set": {"items": []}})
        res = await db.addresses.delete_many({"user_id": str(cust["_id"]),
                                              "label": {"$regex": "^TEST_"}})
        print("cart cleared; QA addresses removed:", res.deleted_count)
    await db.device_tokens.delete_many({"token": {"$regex": "^TEST_QA_token"}})
    client.close()
    print("cleanup done")


asyncio.run(main())
