from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import get_current_user
from models import AddressInput, gen_id, now_iso

router = APIRouter()


@router.get("/addresses")
async def list_addresses(user: dict = Depends(get_current_user)):
    docs = await db.addresses.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    return docs


@router.post("/addresses")
async def create_address(payload: AddressInput, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc.update({"id": gen_id(), "user_id": user["id"], "created_at": now_iso()})
    if doc["is_default"]:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    else:
        existing = await db.addresses.count_documents({"user_id": user["id"]})
        if existing == 0:
            doc["is_default"] = True
    await db.addresses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/addresses/{address_id}")
async def update_address(address_id: str, payload: AddressInput, user: dict = Depends(get_current_user)):
    addr = await db.addresses.find_one({"id": address_id, "user_id": user["id"]})
    if not addr:
        raise HTTPException(status_code=404, detail="Address not found")
    data = payload.model_dump()
    if data["is_default"]:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    await db.addresses.update_one({"id": address_id}, {"$set": data})
    updated = await db.addresses.find_one({"id": address_id}, {"_id": 0})
    return updated


@router.delete("/addresses/{address_id}")
async def delete_address(address_id: str, user: dict = Depends(get_current_user)):
    res = await db.addresses.delete_one({"id": address_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Address not found")
    return {"message": "Address deleted"}
