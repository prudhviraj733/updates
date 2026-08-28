"""Cleanup for iteration 24: revert seeded product, hard-remove inactive QA/TEST
category docs left over from testing iterations, and clear the test customer cart."""
import asyncio
import os
import subprocess

import requests
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

base = os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]
API = base.rstrip("/") + "/api"
benv = dotenv_values("/app/backend/.env")

# 1. revert seed
subprocess.run(["python", "/app/backend/tests/seed_ui_subsub_iter24.py", "--cleanup"], check=False)


async def purge():
    client = AsyncIOMotorClient(benv["MONGO_URL"])
    db = client[benv["DB_NAME"]]
    patterns = ["^TEST", "^QA24", "^QA Type", "^TSSUB", "^TSUB"]
    total = 0
    for p in patterns:
        res = await db.categories.delete_many({"name": {"$regex": p}, "is_active": False})
        total += res.deleted_count
    print("purged inactive test category docs:", total)
    prods = await db.products.delete_many({"name": {"$regex": "^TEST_PROD"}, "is_active": False})
    print("purged inactive TEST_PROD products:", prods.deleted_count)
    client.close()


asyncio.run(purge())

# 2. clear test customer cart
s = requests.Session()
r = s.post(f"{API}/auth/login", json={"email": "customer@test.com", "password": "Test@12345"})
if r.status_code == 200:
    tok = r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    cart = s.get(f"{API}/cart")
    print("cart status", cart.status_code, str(cart.text)[:200])
    d = s.delete(f"{API}/cart")
    print("cart clear:", d.status_code, d.text[:120])
