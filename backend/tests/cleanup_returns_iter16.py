"""Cleanup of iteration-16 refund/replacement test artifacts."""
import os

from dotenv import dotenv_values
from pymongo import MongoClient

env = dotenv_values("/app/backend/.env")
cli = MongoClient(env["MONGO_URL"])
db = cli[env["DB_NAME"]]

ORDER = "TEST-RET-ORDER-1"
TOOR = "f661723a-3fee-4fbd-ad91-60ae90abdbcc"

rets = list(db.returns.find({"order_id": ORDER}, {"_id": 0, "id": 1, "request_number": 1,
                                                 "type": 1, "status": 1, "product_id": 1, "quantity": 1}))
print("returns to remove:", len(rets))

# 1. remove wallet ledger refund entries created by these requests
removed_amount = 0.0
for r in rets:
    for entry in db.wallet_ledger.find({"reason": "refund", "notes": {"$regex": r["request_number"]}}):
        removed_amount += entry.get("amount", 0)
        db.wallet_ledger.delete_one({"_id": entry["_id"]})
print("wallet ledger refund entries removed, net amount:", round(removed_amount, 2))

# 2. restore Toor Dal PIN inventory (replacement moved 2 available -> sold)
inv = db.inventory.find_one({"product_id": TOOR, "pincode": "520003"})
if inv:
    print("toor inv before:", inv.get("available_quantity"), inv.get("reserved_quantity"), inv.get("sold_quantity"))
    db.inventory.update_one({"_id": inv["_id"]},
                            {"$inc": {"available_quantity": 2, "sold_quantity": -2}})
    inv2 = db.inventory.find_one({"_id": inv["_id"]})
    print("toor inv after:", inv2.get("available_quantity"), inv2.get("reserved_quantity"), inv2.get("sold_quantity"))

# 3. delete the test return requests
print("deleted returns:", db.returns.delete_many({"order_id": ORDER}).deleted_count)

# 4. delete TEST_ reasons
print("deleted reasons:", db.return_reasons.delete_many({"label": {"$regex": "^TEST_"}}).deleted_count)

# 5. verify order untouched
o = db.orders.find_one({"id": ORDER}, {"_id": 0, "status": 1, "subtotal": 1, "final_amount": 1, "items": 1})
print("order:", o["status"], o["subtotal"], o["final_amount"], len(o["items"]))
