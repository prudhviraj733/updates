import os
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

imgs = {
    "Dals & Pulses": "https://images.unsplash.com/photo-1780478238047-13e4e6c07cba?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    "Oils": "https://images.pexels.com/photos/31275834/pexels-photo-31275834.jpeg?auto=compress&cs=tinysrgb&w=800",
    "Sugar & Salt": "https://images.unsplash.com/photo-1649509857227-f63b234545f8?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    "Grocery Essentials": "https://images.unsplash.com/photo-1615897570582-285ffe259530?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    "Flours": "https://images.unsplash.com/photo-1615897570582-285ffe259530?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
}
for name, url in imgs.items():
    r = db.categories.update_one({"name": name}, {"$set": {"image_url": url}})
    print(name, r.modified_count)
print("done")
