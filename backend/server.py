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
    settings, admin_misc,
)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Freshly Grocery API")


@app.get("/api/")
async def root():
    return {"message": "Freshly Grocery API is running", "status": "ok"}


for module in (auth, addresses, locations, categories, products, inventory,
               cart, wishlist, delivery, orders, coupons, payments, packages,
               settings, admin_misc):
    app.include_router(module.router, prefix="/api")


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.products.create_index("category_id")
    await db.products.create_index("location_ids")
    await db.products.create_index("name")
    await db.inventory.create_index([("product_id", 1), ("location_id", 1)], unique=True)
    await db.orders.create_index("user_id")
    await db.orders.create_index("status")
    await db.orders.create_index([("location_id", 1), ("slot_id", 1)])
    await db.addresses.create_index("user_id")
    await db.carts.create_index([("user_id", 1), ("location_id", 1)], unique=True)
    await db.categories.create_index("display_order")
    await db.coupons.create_index("code", unique=True)
    await run_seed()
    logger.info("Startup complete: indexes ensured and data seeded.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
allowed = list({frontend_url, "http://localhost:3000"})
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
