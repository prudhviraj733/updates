from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core.db import db
from core.security import require_admin
from models import ProductInput, gen_id, now_iso

router = APIRouter()


def compute_discount(mrp: float, sp: float) -> float:
    if mrp and mrp > sp:
        return round((mrp - sp) / mrp * 100)
    return 0


async def enrich(product: dict, location_id: Optional[str] = None) -> dict:
    product["discount_percent"] = compute_discount(product.get("mrp", 0), product.get("selling_price", 0))
    inv_query = {"product_id": product["id"]}
    if location_id:
        inv_query["location_id"] = location_id
        inv = await db.inventory.find_one(inv_query, {"_id": 0})
        product["stock"] = inv["available_quantity"] if inv else 0
        product["in_stock"] = product["stock"] > 0
    return product


@router.get("/products")
async def list_products(
    category_id: Optional[str] = None,
    subcategory_id: Optional[str] = None,
    brand_id: Optional[str] = None,
    location_id: Optional[str] = None,
    search: Optional[str] = None,
    featured: Optional[bool] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    min_discount: Optional[int] = None,
    in_stock: Optional[bool] = None,
):
    query = {"is_active": True}
    if category_id:
        query["category_id"] = category_id
    if subcategory_id:
        query["subcategory_id"] = subcategory_id
    if brand_id:
        query["brand_id"] = brand_id
    if location_id:
        query["location_ids"] = location_id
    if featured is not None:
        query["is_featured"] = featured
    if min_price is not None or max_price is not None:
        price_q = {}
        if min_price is not None:
            price_q["$gte"] = min_price
        if max_price is not None:
            price_q["$lte"] = max_price
        query["selling_price"] = price_q
    if search:
        # Search across product name, sku, description AND brand name
        brand_ids = [b["id"] for b in await db.brands.find(
            {"name": {"$regex": search, "$options": "i"}}, {"id": 1, "_id": 0}).to_list(200)]
        ors = [
            {"name": {"$regex": search, "$options": "i"}},
            {"sku": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]
        if brand_ids:
            ors.append({"brand_id": {"$in": brand_ids}})
        query["$or"] = ors
    docs = await db.products.find(query, {"_id": 0}).to_list(1000)
    result = [await enrich(d, location_id) for d in docs]
    if min_discount:
        result = [p for p in result if p.get("discount_percent", 0) >= min_discount]
    if in_stock:
        result = [p for p in result if p.get("in_stock")]
    return result


@router.get("/products/{product_id}")
async def get_product(product_id: str, location_id: Optional[str] = None):
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return await enrich(doc, location_id)


# ---- Admin ----
@router.get("/admin/products")
async def admin_list_products(admin: dict = Depends(require_admin)):
    docs = await db.products.find({}, {"_id": 0}).to_list(2000)
    return [await enrich(d) for d in docs]


@router.post("/admin/products")
async def create_product(payload: ProductInput, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    pid = gen_id()
    doc.update({"id": pid, "created_at": now_iso(), "updated_at": now_iso()})
    await db.products.insert_one(doc)
    for loc in doc.get("location_ids", []):
        exists = await db.inventory.find_one({"product_id": pid, "location_id": loc})
        if not exists:
            await db.inventory.insert_one({
                "id": gen_id(), "product_id": pid, "location_id": loc,
                "available_quantity": 0, "reserved_quantity": 0, "sold_quantity": 0,
                "low_stock_threshold": 5, "updated_at": now_iso(),
            })
    doc.pop("_id", None)
    return doc


@router.put("/admin/products/{product_id}")
async def update_product(product_id: str, payload: ProductInput, admin: dict = Depends(require_admin)):
    data = payload.model_dump()
    data["updated_at"] = now_iso()
    res = await db.products.update_one({"id": product_id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    for loc in data.get("location_ids", []):
        exists = await db.inventory.find_one({"product_id": product_id, "location_id": loc})
        if not exists:
            await db.inventory.insert_one({
                "id": gen_id(), "product_id": product_id, "location_id": loc,
                "available_quantity": 0, "reserved_quantity": 0, "sold_quantity": 0,
                "low_stock_threshold": 5, "updated_at": now_iso(),
            })
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@router.delete("/admin/products/{product_id}")
async def delete_product(product_id: str, admin: dict = Depends(require_admin)):
    await db.products.update_one({"id": product_id}, {"$set": {"is_active": False}})
    return {"message": "Product deactivated"}
