import logging
import os

from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from core.db import db, client
from seed import run_seed
from routers import (
    auth, addresses, locations, categories, products, inventory,
    cart, wishlist, delivery, orders, coupons, payments, packages,
    settings, admin_misc, uploads, combo_banners, personalization,
    brands, pincodes, analytics, wallet, referral, customers, returns, usage,
    notifications_center, seo, receipts, profit,
)
from core.fcm import init_fcm

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="SavingSmart Grocery API")


@app.get("/api/")
async def root():
    return {"message": "SavingSmart Grocery API is running", "status": "ok"}


for module in (auth, addresses, locations, categories, products, inventory,
               cart, wishlist, delivery, orders, coupons, payments, packages,
               settings, admin_misc, uploads, combo_banners, personalization,
               brands, pincodes, analytics, wallet, referral, customers, returns, usage,
               notifications_center, seo, receipts, profit):
    app.include_router(module.router, prefix="/api")


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.products.create_index("category_id")
    await db.products.create_index("location_ids")
    await db.products.create_index("name")
    # Inventory: per-PIN + legacy per-location rows. Migrate old (product_id,location_id) unique index.
    try:
        existing_idx = await db.inventory.index_information()
        if "product_id_1_location_id_1" in existing_idx:
            await db.inventory.drop_index("product_id_1_location_id_1")
    except Exception:
        pass
    await db.inventory.create_index(
        [("product_id", 1), ("location_id", 1), ("pincode", 1)], unique=True)
    await db.orders.create_index("user_id")
    await db.orders.create_index("status")
    await db.orders.create_index([("location_id", 1), ("slot_id", 1)])
    await db.addresses.create_index("user_id")
    await db.carts.create_index([("user_id", 1), ("location_id", 1)], unique=True)
    await db.categories.create_index("display_order")
    await db.coupons.create_index("code", unique=True)
    await db.brands.create_index("name")
    await db.pincodes.create_index("pincode", unique=True)
    await db.pincodes.create_index("location_id")
    await db.categories.create_index("parent_id")
    await db.wallet_ledger.create_index("user_id")
    await db.wallet_ledger.create_index("payment_ref")
    await db.withdrawals.create_index("user_id")
    await db.withdrawals.create_index("status")
    await db.wallet_topups.create_index("razorpay_order_id")
    await db.referrals.create_index("referrer_id")
    await db.users.create_index("referral_code")
    await db.usage_pings.create_index([("visitor_id", 1), ("platform", 1), ("day", 1)], unique=True)
    await db.usage_pings.create_index("day")
    await db.visitors.create_index([("visitor_id", 1), ("platform", 1)], unique=True)
    await db.orders.create_index("platform")
    await db.device_tokens.create_index([("user_id", 1), ("token", 1)], unique=True)
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.notifications.create_index("campaign_id")
    await db.notification_campaigns.create_index([("status", 1), ("scheduled_at", 1)])
    await db.coupon_events.create_index([("code", 1), ("created_at", -1)])
    await db.coupon_events.create_index([("code", 1), ("user_id", 1), ("type", 1), ("day", 1)])
    init_fcm()
    await run_seed()
    try:
        from routers.uploads import init_storage
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed (uploads will retry on demand): {e}")
    logger.info("Startup complete: indexes ensured and data seeded.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


_cors = os.environ.get("CORS_ORIGINS", "").strip()
if _cors:
    allowed = [o.strip() for o in _cors.split(",") if o.strip()]
else:
    _fu = os.environ.get("FRONTEND_URL", "").strip()
    allowed = [_fu] if _fu else ["http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
