from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import get_current_user
from models import CartItemInput, CartUpdateInput, ComboCartInput, ComboCartUpdateInput, gen_id

router = APIRouter()


async def get_or_create_cart(user_id: str, location_id: str) -> dict:
    cart = await db.carts.find_one({"user_id": user_id, "location_id": location_id})
    if not cart:
        cart = {"user_id": user_id, "location_id": location_id, "items": []}
        await db.carts.insert_one(cart)
        cart = await db.carts.find_one({"user_id": user_id, "location_id": location_id})
    return cart


async def build_cart_response(user_id: str, location_id: str) -> dict:
    from routers.packages import price_and_validate_combo
    cart = await get_or_create_cart(user_id, location_id)
    items = []
    combos = []
    products_subtotal = 0.0
    combos_effective = 0.0
    total_mrp = 0.0
    count = 0
    for it in cart.get("items", []):
        if it.get("type") == "combo":
            pkg = await db.packages.find_one({"id": it["combo_id"], "is_active": True}, {"_id": 0})
            if not pkg:
                continue
            try:
                priced = await price_and_validate_combo(pkg, it.get("selections", {}), location_id, validate_stock=False)
            except Exception:
                continue
            combos_effective += priced["effective_price"]
            for li in priced["items"]:
                count += li["quantity"]
            combos.append({
                "line_id": it["line_id"], "type": "combo", "combo_id": pkg["id"],
                "name": pkg["name"], "image": priced["image"],
                "base_price": priced["base_price"], "chosen_value": priced["chosen_value"],
                "savings": priced["savings"], "effective_price": priced["effective_price"],
                "items": priced["items"], "selections": it.get("selections", {}),
            })
            continue
        product = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
        if not product or not product.get("is_active"):
            continue
        inv = await db.inventory.find_one({"product_id": it["product_id"], "location_id": location_id}, {"_id": 0})
        stock = inv["available_quantity"] if inv else 0
        line_total = product["selling_price"] * it["quantity"]
        products_subtotal += line_total
        total_mrp += product.get("mrp", product["selling_price"]) * it["quantity"]
        count += it["quantity"]
        items.append({
            "product_id": it["product_id"],
            "name": product["name"],
            "image": product["images"][0] if product.get("images") else "",
            "pack_size": product.get("pack_size", ""),
            "unit_price": product["selling_price"],
            "mrp": product.get("mrp", product["selling_price"]),
            "quantity": it["quantity"],
            "line_total": round(line_total, 2),
            "stock": stock,
        })
    return {
        "location_id": location_id,
        "items": items,
        "combos": combos,
        "subtotal": round(products_subtotal + combos_effective, 2),
        "product_discount": round(total_mrp - products_subtotal, 2),
        "count": count,
    }


@router.get("/cart")
async def get_cart(location_id: str, user: dict = Depends(get_current_user)):
    return await build_cart_response(user["id"], location_id)


@router.post("/cart/items")
async def add_item(payload: CartItemInput, user: dict = Depends(get_current_user)):
    inv = await db.inventory.find_one({"product_id": payload.product_id, "location_id": payload.location_id})
    stock = inv["available_quantity"] if inv else 0
    cart = await get_or_create_cart(user["id"], payload.location_id)
    items = cart.get("items", [])
    existing = next((i for i in items if i.get("product_id") == payload.product_id), None)
    new_qty = (existing["quantity"] if existing else 0) + payload.quantity
    if new_qty > stock:
        raise HTTPException(status_code=409, detail=f"Only {stock} in stock")
    if existing:
        existing["quantity"] = new_qty
    else:
        items.append({"product_id": payload.product_id, "quantity": payload.quantity})
    await db.carts.update_one({"user_id": user["id"], "location_id": payload.location_id}, {"$set": {"items": items}})
    return await build_cart_response(user["id"], payload.location_id)


@router.put("/cart/items/{product_id}")
async def update_item(product_id: str, payload: CartUpdateInput, user: dict = Depends(get_current_user)):
    cart = await get_or_create_cart(user["id"], payload.location_id)
    items = cart.get("items", [])
    if payload.quantity <= 0:
        items = [i for i in items if i.get("product_id") != product_id]
    else:
        inv = await db.inventory.find_one({"product_id": product_id, "location_id": payload.location_id})
        stock = inv["available_quantity"] if inv else 0
        if payload.quantity > stock:
            raise HTTPException(status_code=409, detail=f"Only {stock} in stock")
        found = next((i for i in items if i.get("product_id") == product_id), None)
        if found:
            found["quantity"] = payload.quantity
        else:
            items.append({"product_id": product_id, "quantity": payload.quantity})
    await db.carts.update_one({"user_id": user["id"], "location_id": payload.location_id}, {"$set": {"items": items}})
    return await build_cart_response(user["id"], payload.location_id)


@router.delete("/cart/items/{product_id}")
async def remove_item(product_id: str, location_id: str, user: dict = Depends(get_current_user)):
    cart = await get_or_create_cart(user["id"], location_id)
    items = [i for i in cart.get("items", []) if i.get("product_id") != product_id]
    await db.carts.update_one({"user_id": user["id"], "location_id": location_id}, {"$set": {"items": items}})
    return await build_cart_response(user["id"], location_id)


# ---- Combo bundle lines (kept as a single line in the cart) ----
@router.post("/cart/combo")
async def add_combo(payload: ComboCartInput, user: dict = Depends(get_current_user)):
    from routers.packages import price_and_validate_combo
    pkg = await db.packages.find_one({"id": payload.combo_id, "is_active": True}, {"_id": 0})
    if not pkg:
        raise HTTPException(status_code=404, detail="Combo not found")
    await price_and_validate_combo(pkg, payload.selections, payload.location_id, validate_stock=True)
    cart = await get_or_create_cart(user["id"], payload.location_id)
    items = cart.get("items", [])
    items.append({"line_id": gen_id(), "type": "combo",
                  "combo_id": payload.combo_id, "selections": payload.selections})
    await db.carts.update_one({"user_id": user["id"], "location_id": payload.location_id}, {"$set": {"items": items}})
    return await build_cart_response(user["id"], payload.location_id)


@router.put("/cart/combo/{line_id}")
async def update_combo(line_id: str, payload: ComboCartUpdateInput, user: dict = Depends(get_current_user)):
    from routers.packages import price_and_validate_combo
    cart = await get_or_create_cart(user["id"], payload.location_id)
    items = cart.get("items", [])
    line = next((i for i in items if i.get("line_id") == line_id and i.get("type") == "combo"), None)
    if not line:
        raise HTTPException(status_code=404, detail="Combo not in cart")
    pkg = await db.packages.find_one({"id": line["combo_id"], "is_active": True}, {"_id": 0})
    if not pkg:
        raise HTTPException(status_code=404, detail="Combo not found")
    await price_and_validate_combo(pkg, payload.selections, payload.location_id, validate_stock=True)
    line["selections"] = payload.selections
    await db.carts.update_one({"user_id": user["id"], "location_id": payload.location_id}, {"$set": {"items": items}})
    return await build_cart_response(user["id"], payload.location_id)


@router.delete("/cart/combo/{line_id}")
async def remove_combo(line_id: str, location_id: str, user: dict = Depends(get_current_user)):
    cart = await get_or_create_cart(user["id"], location_id)
    items = [i for i in cart.get("items", []) if i.get("line_id") != line_id]
    await db.carts.update_one({"user_id": user["id"], "location_id": location_id}, {"$set": {"items": items}})
    return await build_cart_response(user["id"], location_id)


@router.delete("/cart")
async def clear_cart(location_id: str, user: dict = Depends(get_current_user)):
    await db.carts.update_one({"user_id": user["id"], "location_id": location_id}, {"$set": {"items": []}})
    return await build_cart_response(user["id"], location_id)
