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


async def enrich(product: dict, location_id: Optional[str] = None, pincode: Optional[str] = None) -> dict:
    from routers.inventory import resolve_stock
    product["discount_percent"] = compute_discount(product.get("mrp", 0), product.get("selling_price", 0))
    if location_id or pincode:
        stock, _ = await resolve_stock(product["id"], pincode=pincode, location_id=location_id)
        product["stock"] = stock
        product["in_stock"] = stock > 0
    return product


@router.get("/products")
async def list_products(
    category_id: Optional[str] = None,
    subcategory_id: Optional[str] = None,
    subsubcategory_id: Optional[str] = None,
    brand_id: Optional[str] = None,
    location_id: Optional[str] = None,
    pincode: Optional[str] = None,
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
    if subsubcategory_id:
        query["subsubcategory_id"] = subsubcategory_id
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
    result = [await enrich(d, location_id, pincode) for d in docs]
    # PIN-level availability: only show products enabled for the selected PIN
    if pincode:
        enabled_ids = set(
            r["product_id"] for r in await db.inventory.find(
                {"pincode": pincode, "enabled": {"$ne": False}}, {"_id": 0, "product_id": 1}).to_list(5000))
        result = [p for p in result if p["id"] in enabled_ids]
    if min_discount:
        result = [p for p in result if p.get("discount_percent", 0) >= min_discount]
    if in_stock:
        result = [p for p in result if p.get("in_stock")]
    return result


async def _validate_hierarchy(category_id: str, subcategory_id: Optional[str], subsubcategory_id: Optional[str]):
    """Server-authoritative category > subcategory > sub-subcategory chain validation."""
    cat = await db.categories.find_one({"id": category_id, "parent_id": None})
    if not cat:
        raise HTTPException(status_code=400, detail="Invalid category")
    if subsubcategory_id and not subcategory_id:
        raise HTTPException(status_code=400, detail="Select a subcategory before choosing a sub-subcategory")
    if subcategory_id:
        sub = await db.categories.find_one({"id": subcategory_id})
        if not sub or sub.get("parent_id") != category_id:
            raise HTTPException(status_code=400, detail="Subcategory does not belong to the selected category")
    if subsubcategory_id:
        ssub = await db.categories.find_one({"id": subsubcategory_id})
        if not ssub or ssub.get("parent_id") != subcategory_id:
            raise HTTPException(status_code=400, detail="Sub-subcategory does not belong to the selected subcategory")


async def _pin_enabled_ids(pincode: Optional[str]):
    if not pincode:
        return None
    rows = await db.inventory.find(
        {"pincode": pincode, "enabled": {"$ne": False}}, {"_id": 0, "product_id": 1}).to_list(10000)
    return set(r["product_id"] for r in rows)


def _available(p: dict, enabled_ids) -> bool:
    if enabled_ids is not None and p["id"] not in enabled_ids:
        return False
    return bool(p.get("in_stock"))


async def _alternatives(product: dict, location_id, pincode, enabled_ids, limit: int = 8):
    """Available replacements by priority: sub-subcategory -> subcategory -> category (excludes self)."""
    seen = {product["id"]}
    picked = []

    async def gather(field):
        val = product.get(field)
        if not val:
            return
        docs = await db.products.find(
            {field: val, "is_active": True, "id": {"$nin": list(seen)}}, {"_id": 0}).to_list(80)
        for ap in docs:
            if len(picked) >= limit:
                break
            e = await enrich(ap, location_id, pincode)
            if e["id"] in seen or not _available(e, enabled_ids):
                continue
            e["match_level"] = field
            picked.append(e)
            seen.add(e["id"])

    for f in ("subsubcategory_id", "subcategory_id", "category_id"):
        if len(picked) < limit:
            await gather(f)
    return picked[:limit]


@router.get("/products/search-resolve")
async def search_resolve(q: str, location_id: Optional[str] = None, pincode: Optional[str] = None):
    """Exact search with availability awareness: distinguishes not-found vs out-of-stock and
    returns available alternatives (sub-subcategory -> subcategory -> category priority)."""
    q = (q or "").strip()
    if not q:
        return {"query": q, "status": "not_found", "products": [], "unavailable": None,
                "alternatives": [], "message": "Type something to search."}
    brand_ids = [b["id"] for b in await db.brands.find(
        {"name": {"$regex": q, "$options": "i"}}, {"id": 1, "_id": 0}).to_list(200)]
    ors = [
        {"name": {"$regex": q, "$options": "i"}},
        {"sku": {"$regex": q, "$options": "i"}},
        {"description": {"$regex": q, "$options": "i"}},
    ]
    if brand_ids:
        ors.append({"brand_id": {"$in": brand_ids}})
    docs = await db.products.find({"is_active": True, "$or": ors}, {"_id": 0}).to_list(1000)
    enabled_ids = await _pin_enabled_ids(pincode)
    enriched = [await enrich(d, location_id, pincode) for d in docs]
    available = [p for p in enriched if _available(p, enabled_ids)]
    if available:
        return {"query": q, "status": "available", "products": available, "unavailable": None,
                "alternatives": [], "message": ""}
    if not enriched:
        return {"query": q, "status": "not_found", "products": [], "unavailable": None,
                "alternatives": [], "message": f'We couldn\'t find any product matching "{q}".'}
    ql = q.lower()
    enriched.sort(key=lambda p: 0 if ql in (p.get("name", "") or "").lower() else 1)
    unavailable = enriched[0]
    alts = await _alternatives(unavailable, location_id, pincode, enabled_ids)
    if alts:
        msg = f'"{unavailable["name"]}" is currently out of stock. Here are available alternatives:'
    else:
        msg = (f'"{unavailable["name"]}" is currently out of stock, and we couldn\'t find any '
               f'available alternatives right now.')
    return {"query": q, "status": "out_of_stock", "products": [], "unavailable": unavailable,
            "alternatives": alts, "message": msg}


@router.get("/products/{product_id}")
async def get_product(product_id: str, location_id: Optional[str] = None, pincode: Optional[str] = None):
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return await enrich(doc, location_id, pincode)


# ---- Admin ----
@router.get("/admin/products")
async def admin_list_products(admin: dict = Depends(require_admin)):
    docs = await db.products.find({}, {"_id": 0}).to_list(2000)
    return [await enrich(d) for d in docs]


@router.post("/admin/products")
async def create_product(payload: ProductInput, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    await _validate_hierarchy(doc["category_id"], doc.get("subcategory_id"), doc.get("subsubcategory_id"))
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
    await _validate_hierarchy(data["category_id"], data.get("subcategory_id"), data.get("subsubcategory_id"))
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
