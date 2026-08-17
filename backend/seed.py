import os
from datetime import datetime, timezone

from core.db import db
from core.security import hash_password, verify_password
from models import gen_id, now_iso

SPICE_IMG = "https://images.unsplash.com/photo-1656497119922-068c6a5e1193?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHw0fHxpbmRpYW4lMjBzcGljZXMlMjBwb3dkZXJ8ZW58MHx8fHwxNzg2OTA1NTM5fDA&ixlib=rb-4.1.0&q=85"
DRYFRUIT_IMG = "https://images.unsplash.com/photo-1600189020840-e9918c25269d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDB8MHwxfHNlYXJjaHwxfHxkcnklMjBmcnVpdHMlMjBudXRzfGVufDB8fHx8MTc4NjkwNTUzOXww&ixlib=rb-4.1.0&q=85"
RICE_IMG = "https://images.unsplash.com/photo-1586201375761-83865001e31c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzl8MHwxfHNlYXJjaHwxfHxyaWNlJTIwZ3JhaW5zJTIwcmF3fGVufDB8fHx8MTc4NjkwNTUzOHww&ixlib=rb-4.1.0&q=85"


async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "name": "Store Admin", "email": admin_email,
            "password_hash": hash_password(admin_password), "phone": "+919000000000",
            "role": "admin", "wishlist": [], "created_at": now_iso(),
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}})

    test_email = "customer@test.com"
    if not await db.users.find_one({"email": test_email}):
        await db.users.insert_one({
            "name": "Test Customer", "email": test_email,
            "password_hash": hash_password("Test@12345"), "phone": "+919888877777",
            "role": "customer", "wishlist": [], "created_at": now_iso(),
        })


async def seed_data():
    if await db.locations.count_documents({}) > 0:
        return

    loc_id = gen_id()
    await db.locations.insert_one({
        "id": loc_id, "name": "Hyderabad - Central", "city": "Hyderabad", "area": "Banjara Hills",
        "is_active": True, "delivery_available": True, "delivery_charge": 40,
        "min_order_value": 199, "pincodes": ["500034", "500073", "500082"],
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    await db.delivery_settings.insert_one({
        "location_id": loc_id, "operating_start": "08:00", "operating_end": "21:00",
        "slot_duration_minutes": 90, "prep_time_minutes": 90, "max_orders_per_slot": 10,
        "asap_enabled": True, "asap_charge": 100, "holidays": [],
    })

    categories = [
        ("Rice", RICE_IMG, "Premium quality rice varieties"),
        ("Dals & Pulses", "", "Lentils and pulses"),
        ("Flours", "", "Atta, maida and more"),
        ("Oils", "", "Cooking oils and ghee"),
        ("Sugar & Salt", "", "Sweeteners and salt"),
        ("Spices", SPICE_IMG, "Authentic Indian spices"),
        ("Grocery Essentials", "", "Everyday kitchen staples"),
        ("Dry Fruits", DRYFRUIT_IMG, "Premium dry fruits"),
        ("Nuts", DRYFRUIT_IMG, "Fresh healthy nuts"),
    ]
    cat_ids = {}
    for i, (name, img, desc) in enumerate(categories):
        cid = gen_id()
        cat_ids[name] = cid
        await db.categories.insert_one({
            "id": cid, "name": name, "description": desc, "image_url": img,
            "parent_id": None, "display_order": i, "is_active": True,
            "created_at": now_iso(), "updated_at": now_iso(),
        })

    products = [
        ("India Gate Basmati Rice", "Rice", RICE_IMG, "5 kg", "kg", 850, 699, "RICE-BAS-5", True),
        ("Sona Masoori Rice", "Rice", RICE_IMG, "10 kg", "kg", 720, 620, "RICE-SON-10", True),
        ("Kolam Rice", "Rice", RICE_IMG, "5 kg", "kg", 480, 420, "RICE-KOL-5", False),
        ("Toor Dal (Arhar)", "Dals & Pulses", "", "1 kg", "kg", 180, 155, "DAL-TOOR-1", True),
        ("Moong Dal", "Dals & Pulses", "", "1 kg", "kg", 160, 139, "DAL-MOONG-1", False),
        ("Chana Dal", "Dals & Pulses", "", "1 kg", "kg", 120, 99, "DAL-CHANA-1", False),
        ("Urad Dal", "Dals & Pulses", "", "1 kg", "kg", 170, 149, "DAL-URAD-1", False),
        ("Whole Wheat Atta", "Flours", "", "5 kg", "kg", 320, 275, "FLR-ATTA-5", True),
        ("Maida (Refined Flour)", "Flours", "", "1 kg", "kg", 60, 52, "FLR-MAIDA-1", False),
        ("Besan (Gram Flour)", "Flours", "", "1 kg", "kg", 110, 95, "FLR-BESAN-1", False),
        ("Fortune Sunflower Oil", "Oils", "", "1 L", "L", 180, 155, "OIL-SUN-1", True),
        ("Cold Pressed Groundnut Oil", "Oils", "", "1 L", "L", 320, 289, "OIL-GND-1", False),
        ("Pure Cow Ghee", "Oils", "", "500 ml", "ml", 420, 379, "OIL-GHEE-500", True),
        ("Refined Sugar", "Sugar & Salt", "", "1 kg", "kg", 55, 48, "SGR-REF-1", False),
        ("Rock Salt (Sendha Namak)", "Sugar & Salt", "", "1 kg", "kg", 65, 55, "SLT-ROCK-1", False),
        ("Iodized Salt", "Sugar & Salt", "", "1 kg", "kg", 28, 24, "SLT-IOD-1", False),
        ("Turmeric Powder", "Spices", SPICE_IMG, "200 g", "g", 90, 78, "SPC-TUR-200", True),
        ("Red Chilli Powder", "Spices", SPICE_IMG, "200 g", "g", 110, 95, "SPC-CHI-200", False),
        ("Garam Masala", "Spices", SPICE_IMG, "100 g", "g", 85, 72, "SPC-GAR-100", True),
        ("Coriander Powder", "Spices", SPICE_IMG, "200 g", "g", 70, 60, "SPC-COR-200", False),
        ("Tea Powder", "Grocery Essentials", "", "500 g", "g", 250, 220, "GRC-TEA-500", False),
        ("Instant Coffee", "Grocery Essentials", "", "100 g", "g", 320, 289, "GRC-COF-100", False),
        ("Almonds (Badam)", "Dry Fruits", DRYFRUIT_IMG, "500 g", "g", 550, 479, "DRY-ALM-500", True),
        ("Cashews (Kaju)", "Dry Fruits", DRYFRUIT_IMG, "500 g", "g", 620, 549, "DRY-CAS-500", True),
        ("Raisins (Kishmish)", "Dry Fruits", DRYFRUIT_IMG, "250 g", "g", 180, 149, "DRY-RAI-250", False),
        ("Pistachios", "Nuts", DRYFRUIT_IMG, "250 g", "g", 480, 429, "NUT-PIS-250", True),
        ("Walnuts (Akhrot)", "Nuts", DRYFRUIT_IMG, "500 g", "g", 720, 649, "NUT-WAL-500", False),
        ("Peanuts (Raw)", "Nuts", DRYFRUIT_IMG, "1 kg", "kg", 140, 119, "NUT-PEA-1", False),
    ]
    for name, cat, img, pack, unit, mrp, sp, sku, featured in products:
        pid = gen_id()
        await db.products.insert_one({
            "id": pid, "name": name, "description": f"{name} - premium quality, carefully sourced and packed.",
            "category_id": cat_ids[cat], "subcategory_id": None,
            "images": [img] if img else [SPICE_IMG],
            "pack_size": pack, "unit": unit, "mrp": mrp, "selling_price": sp, "sku": sku,
            "is_active": True, "is_featured": featured, "location_ids": [loc_id],
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        await db.inventory.insert_one({
            "id": gen_id(), "product_id": pid, "location_id": loc_id,
            "available_quantity": 100, "reserved_quantity": 0, "sold_quantity": 0,
            "low_stock_threshold": 10, "updated_at": now_iso(),
        })

    await db.coupons.insert_one({
        "id": gen_id(), "code": "WELCOME50", "discount_type": "fixed", "discount_value": 50,
        "min_order_value": 299, "max_discount": None, "start_date": None, "end_date": None,
        "is_active": True, "location_ids": [], "category_ids": [], "created_at": now_iso(),
    })
    await db.coupons.insert_one({
        "id": gen_id(), "code": "SAVE10", "discount_type": "percentage", "discount_value": 10,
        "min_order_value": 499, "max_discount": 150, "start_date": None, "end_date": None,
        "is_active": True, "location_ids": [], "category_ids": [], "created_at": now_iso(),
    })

    await db.business_settings.update_one({"key": "global"}, {"$set": {
        "key": "global", "store_name": "Freshly", "support_phone": "+91 90000 00000",
        "support_email": "support@freshly.example", "currency": "INR",
        "cod_enabled": True, "online_payment_enabled": True,
    }}, upsert=True)


async def write_credentials():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    content = f"""# Test Credentials

## Admin Account
- Email: {admin_email}
- Password: {admin_password}
- Role: admin
- Access: Admin dashboard at /admin

## Test Customer Account
- Email: customer@test.com
- Password: Test@12345
- Role: customer

## Auth Endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET  /api/auth/me
- POST /api/auth/refresh

## Notes
- Auth uses JWT in httpOnly cookies (frontend sends withCredentials).
- Admin routes are under /api/admin/* and require role=admin.
"""
    from pathlib import Path
    p = Path("/app/memory/test_credentials.md")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)


async def seed_combos_and_banners():
    if await db.combo_banners.count_documents({}) > 0:
        return
    locs = await db.locations.find({"is_active": True}, {"_id": 0, "id": 1}).to_list(100)
    loc_ids = [l["id"] for l in locs]

    async def pid(sku):
        p = await db.products.find_one({"sku": sku}, {"_id": 0, "id": 1})
        return p["id"] if p else None

    B1 = "https://images.unsplash.com/photo-1481016863889-534cbad65379?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400"
    B2 = "https://images.unsplash.com/photo-1556191041-c2401936d851?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400"
    B3 = "https://images.pexels.com/photos/8108018/pexels-photo-8108018.jpeg?auto=compress&cs=tinysrgb&w=1400"

    combos = [
        ("Monthly Family Combo", "Everything your family needs for the month", "Limited period offer",
         1149, ["RICE-SON-10", "DAL-TOOR-1", "OIL-SUN-1", "FLR-ATTA-5", "SGR-REF-1", "SPC-TUR-200"], B1),
        ("Breakfast Essentials Combo", "Start every morning right", "Save big this week",
         899, ["FLR-ATTA-5", "OIL-GHEE-500", "GRC-TEA-500", "SGR-REF-1"], B2),
        ("Premium Dry Fruits Combo", "Festive gifting & healthy snacking", "Festive special",
         1499, ["DRY-ALM-500", "DRY-CAS-500", "NUT-PIS-250", "DRY-RAI-250"], B3),
    ]
    order = 0
    for name, sub, promo, price, skus, img in combos:
        ids = [x for x in [await pid(s) for s in skus] if x]
        pkg_id = gen_id()
        await db.packages.insert_one({
            "id": pkg_id, "name": name, "description": sub, "image_url": img,
            "package_type": "monthly", "product_ids": ids, "price": price,
            "is_active": True, "location_ids": loc_ids,
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        await db.combo_banners.insert_one({
            "id": gen_id(), "package_id": pkg_id, "title": name.upper(), "subtitle": sub,
            "promo_text": promo, "cta_text": "View Combo", "image_url": img,
            "display_order": order, "is_active": True, "location_ids": [],
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        order += 1


async def run_seed():
    await seed_admin()
    await seed_data()
    await seed_combos_and_banners()
    await write_credentials()
