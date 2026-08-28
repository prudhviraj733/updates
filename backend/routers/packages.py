from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import require_admin
from models import PackageInput, gen_id, now_iso

router = APIRouter()


@router.get("/packages")
async def list_packages(location_id: str = None):
    query = {"is_active": True}
    if location_id:
        query["location_ids"] = location_id
    return await db.packages.find(query, {"_id": 0}).to_list(200)


def _combo_item_cfg(pkg: dict, pid: str) -> dict:
    cfg = (pkg.get("item_config") or {}).get(pid, {})
    default_qty = int(cfg.get("default_qty", 1) or 1)
    min_qty = int(cfg.get("min_qty", 1) or 1)
    max_qty = int(cfg.get("max_qty", default_qty) or default_qty)
    if max_qty < min_qty:
        max_qty = min_qty
    default_qty = max(min_qty, min(max_qty, default_qty))
    return {
        "qty_editable": bool(cfg.get("qty_editable", False)),
        "swap_allowed": bool(cfg.get("swap_allowed", True)),
        "min_qty": min_qty, "max_qty": max_qty, "default_qty": default_qty,
    }


async def _stock_at(product_id: str, location_id: str, pincode: str = None):
    from routers.inventory import resolve_stock
    stock, _ = await resolve_stock(product_id, pincode=pincode, location_id=location_id)
    return stock


async def _combo_alternatives(pkg: dict, pid: str, orig: dict, location_id: str, pincode: str = None, limit: int = 8) -> list:
    """Swap options for a combo item: admin-approved first, then smart same-subcategory /
    same-category suggestions (each tagged recommended + source)."""
    cfg = _combo_item_cfg(pkg, pid)
    if not cfg["swap_allowed"]:
        return []
    swaps = pkg.get("swap_options", {}) or {}
    subsub, sub, cat = orig.get("subsubcategory_id"), orig.get("subcategory_id"), orig.get("category_id")
    seen = {pid}
    picked = []  # (product_doc, source)
    for aid in (swaps.get(pid) or []):
        if aid in seen:
            continue
        ap = await db.products.find_one({"id": aid, "is_active": True}, {"_id": 0})
        if ap:
            picked.append((ap, "admin")); seen.add(aid)

    async def _gather(query):
        cur = db.products.find({**query, "is_active": True, "id": {"$nin": list(seen)}}, {"_id": 0}).limit(limit)
        async for ap in cur:
            if ap["id"] in seen:
                continue
            picked.append((ap, "suggested")); seen.add(ap["id"])

    if subsub and len(picked) < limit:
        await _gather({"subsubcategory_id": subsub})
    if sub and len(picked) < limit:
        await _gather({"subcategory_id": sub})
    if cat and len(picked) < limit:
        await _gather({"category_id": cat})

    out = []
    for ap, source in picked:
        out.append({
            "id": ap["id"], "name": ap["name"], "pack_size": ap.get("pack_size", ""),
            "images": ap.get("images", []), "selling_price": ap.get("selling_price", 0),
            "mrp": ap.get("mrp", 0), "subcategory_id": ap.get("subcategory_id"),
            "subsubcategory_id": ap.get("subsubcategory_id"),
            "category_id": ap.get("category_id"), "stock": await _stock_at(ap["id"], location_id, pincode),
            "source": source, "recommended": (subsub and ap.get("subsubcategory_id") == subsub) or ap.get("subcategory_id") == sub,
        })
    out.sort(key=lambda a: (0 if (subsub and a.get("subsubcategory_id") == subsub) else
                            (1 if a.get("subcategory_id") == sub else (2 if a.get("category_id") == cat else 3)),
                            0 if a["source"] == "admin" else 1, a.get("selling_price", 0)))
    return out[:limit]


async def price_and_validate_combo(pkg: dict, selections: dict, location_id: str, validate_stock: bool = True, pincode: str = None) -> dict:
    """Validate customer's combo selections (swaps + quantities) against admin rules,
    check location inventory, and compute the effective bundle price + savings."""
    swaps = pkg.get("swap_options", {}) or {}
    selections = selections or {}
    line_items = []
    base_value = 0.0
    chosen_value = 0.0
    for pid in pkg.get("product_ids", []):
        orig = await db.products.find_one({"id": pid, "is_active": True}, {"_id": 0})
        if not orig:
            continue
        cfg = _combo_item_cfg(pkg, pid)
        sel = selections.get(pid) or {}
        chosen_id = sel.get("product_id") or pid
        chosen = await db.products.find_one({"id": chosen_id, "is_active": True}, {"_id": 0})
        if not chosen:
            raise HTTPException(status_code=400, detail="A combo item is no longer available")
        if chosen_id != pid:
            approved = swaps.get(pid) or []
            same_group = ((chosen.get("subsubcategory_id") and chosen.get("subsubcategory_id") == orig.get("subsubcategory_id"))
                          or (chosen.get("subcategory_id") and chosen.get("subcategory_id") == orig.get("subcategory_id"))
                          or (chosen.get("category_id") and chosen.get("category_id") == orig.get("category_id")))
            if not cfg["swap_allowed"] or (chosen_id not in approved and not same_group):
                raise HTTPException(status_code=400, detail="Selected replacement is not allowed for this combo")
        base_value += orig.get("selling_price", 0) * cfg["default_qty"]
        # customer-controlled quantity: 0 = removed; capped by admin max (if set) and by inventory
        requested = sel.get("quantity")
        qty = cfg["default_qty"] if requested is None else max(0, int(requested))
        if cfg["qty_editable"] and cfg["max_qty"]:
            qty = min(qty, cfg["max_qty"])
        stock = await _stock_at(chosen_id, location_id, pincode)
        if validate_stock and stock is not None and qty > stock:
            raise HTTPException(status_code=409, detail=f"Only {stock} of {chosen['name']} in stock")
        if qty <= 0:
            continue
        chosen_value += chosen.get("selling_price", 0) * qty
        line_items.append({
            "original_id": pid, "product_id": chosen_id, "name": chosen["name"],
            "image": chosen["images"][0] if chosen.get("images") else "",
            "pack_size": chosen.get("pack_size", ""),
            "unit_price": chosen.get("selling_price", 0),
            "mrp": chosen.get("mrp", chosen.get("selling_price", 0)),
            "cost_price": chosen.get("cost_price", 0),
            "category_id": chosen.get("category_id"),
            "subcategory_id": chosen.get("subcategory_id"),
            "brand_id": chosen.get("brand_id"),
            "quantity": qty, "swapped": chosen_id != pid, "stock": stock,
        })
    savings = max(0.0, round(base_value - pkg.get("price", 0), 2))
    effective_price = max(0.0, round(chosen_value - savings, 2))
    return {
        "combo_id": pkg["id"], "combo_name": pkg["name"], "image": pkg.get("image_url", ""),
        "base_price": round(pkg.get("price", 0), 2), "base_value": round(base_value, 2),
        "chosen_value": round(chosen_value, 2), "savings": savings,
        "effective_price": effective_price, "items": line_items,
    }


@router.get("/packages/{package_id}")
async def get_package(package_id: str, location_id: str = None, pincode: str = None):
    pkg = await db.packages.find_one({"id": package_id, "is_active": True}, {"_id": 0})
    if not pkg:
        raise HTTPException(status_code=404, detail="Combo not found")
    swaps = pkg.get("swap_options", {}) or {}

    def summarize(p, stock=None):
        return {"id": p["id"], "name": p["name"], "pack_size": p.get("pack_size", ""),
                "images": p.get("images", []), "selling_price": p.get("selling_price", 0),
                "mrp": p.get("mrp", 0), "subcategory_id": p.get("subcategory_id"),
                "category_id": p.get("category_id"), "stock": stock}

    products = []
    total = 0.0
    for pid in pkg.get("product_ids", []):
        p = await db.products.find_one({"id": pid, "is_active": True}, {"_id": 0})
        if not p:
            continue
        p["discount_percent"] = round((p["mrp"] - p["selling_price"]) / p["mrp"] * 100) if p.get("mrp", 0) > p.get("selling_price", 0) else 0
        cfg = _combo_item_cfg(pkg, pid)
        p["config"] = cfg
        p["stock"] = await _stock_at(pid, location_id, pincode)
        alts = await _combo_alternatives(pkg, pid, p, location_id, pincode)
        p["alternatives"] = alts
        p["swappable"] = cfg["swap_allowed"] and len(alts) > 0
        products.append(p)
        total += p.get("selling_price", 0) * cfg["default_qty"]
    pkg["products"] = products
    pkg["items_value"] = round(total, 2)
    pkg["savings"] = round(max(0, total - pkg.get("price", 0)), 2)
    return pkg


@router.get("/admin/packages")
async def admin_list_packages(admin: dict = Depends(require_admin)):
    return await db.packages.find({}, {"_id": 0}).to_list(500)


@router.post("/admin/packages")
async def create_package(payload: PackageInput, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc.update({"id": gen_id(), "created_at": now_iso(), "updated_at": now_iso()})
    await db.packages.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/admin/packages/{package_id}")
async def update_package(package_id: str, payload: PackageInput, admin: dict = Depends(require_admin)):
    data = payload.model_dump()
    data["updated_at"] = now_iso()
    res = await db.packages.update_one({"id": package_id}, {"$set": data})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Package not found")
    return await db.packages.find_one({"id": package_id}, {"_id": 0})


@router.delete("/admin/packages/{package_id}")
async def delete_package(package_id: str, admin: dict = Depends(require_admin)):
    await db.packages.update_one({"id": package_id}, {"$set": {"is_active": False}})
    return {"message": "Package deactivated"}
