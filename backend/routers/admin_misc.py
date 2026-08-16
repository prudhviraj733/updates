from fastapi import APIRouter, Depends

from core.db import db
from core.security import require_admin

router = APIRouter()


@router.get("/admin/dashboard/stats")
async def dashboard_stats(admin: dict = Depends(require_admin)):
    total_orders = await db.orders.count_documents({})
    pending_orders = await db.orders.count_documents({"status": "pending"})
    total_products = await db.products.count_documents({"is_active": True})
    total_customers = await db.users.count_documents({"role": "customer"})
    total_locations = await db.locations.count_documents({"is_active": True})

    revenue_cursor = db.orders.find({"payment_status": "paid"}, {"final_amount": 1, "_id": 0})
    revenue = sum([o["final_amount"] async for o in revenue_cursor])

    low_stock = await db.inventory.count_documents({"available_quantity": {"$lte": 5, "$gt": 0}})
    out_of_stock = await db.inventory.count_documents({"available_quantity": {"$lte": 0}})

    recent = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(8)

    # revenue by status
    status_counts = {}
    async for o in db.orders.find({}, {"status": 1, "_id": 0}):
        status_counts[o["status"]] = status_counts.get(o["status"], 0) + 1

    return {
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "total_products": total_products,
        "total_customers": total_customers,
        "total_locations": total_locations,
        "total_revenue": round(revenue, 2),
        "low_stock": low_stock,
        "out_of_stock": out_of_stock,
        "recent_orders": recent,
        "status_counts": status_counts,
    }


@router.get("/admin/customers")
async def list_customers(admin: dict = Depends(require_admin)):
    users = await db.users.find({"role": "customer"}, {"password_hash": 0}).to_list(2000)
    result = []
    for u in users:
        uid = str(u["_id"])
        order_count = await db.orders.count_documents({"user_id": uid})
        addr_count = await db.addresses.count_documents({"user_id": uid})
        result.append({
            "id": uid, "name": u.get("name"), "email": u.get("email"),
            "phone": u.get("phone"), "created_at": u.get("created_at"),
            "order_count": order_count, "address_count": addr_count,
        })
    return result
