import os
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

# Fix flagship combo pricing so items_value > price (savings badge shows)
r = db.packages.update_one({"name": "Monthly Family Combo"}, {"$set": {"price": 1149}})
print("family combo price updated:", r.modified_count)

# Cleanup leftover test locations from prior testing iterations
res = db.locations.delete_many({"name": {"$regex": "^TEST_LOC", "$options": "i"}})
print("removed test locations:", res.deleted_count)
# Remove any banners/packages that referenced removed test locations only (safety: none expected)
print("done")
