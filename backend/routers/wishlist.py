from bson import ObjectId
from fastapi import APIRouter, Depends

from core.db import db
from core.security import get_current_user

router = APIRouter()


@router.get("/wishlist")
async def get_wishlist(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"_id": ObjectId(user["id"])}, {"wishlist": 1})
    ids = u.get("wishlist", []) if u else []
    products = await db.products.find({"id": {"$in": ids}, "is_active": True}, {"_id": 0}).to_list(500)
    for p in products:
        p["discount_percent"] = round((p["mrp"] - p["selling_price"]) / p["mrp"] * 100) if p.get("mrp", 0) > p.get("selling_price", 0) else 0
    return products


@router.post("/wishlist/{product_id}")
async def add_wishlist(product_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$addToSet": {"wishlist": product_id}})
    return {"message": "Added to wishlist"}


@router.delete("/wishlist/{product_id}")
async def remove_wishlist(product_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$pull": {"wishlist": product_id}})
    return {"message": "Removed from wishlist"}
