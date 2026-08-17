import uuid

from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, EmailStr, Field


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_id() -> str:
    return str(uuid.uuid4())


class PersonalizationSettingsInput(BaseModel):
    active_days: int = 30
    inactive_days: int = 45
    comeback_days: int = 30
    high_value_spend: float = 5000
    repeat_orders: int = 3
    frequent_orders: int = 5
    category_affinity_count: int = 2


class CampaignInput(BaseModel):
    name: str
    description: Optional[str] = ""
    offer_type: str = "fixed"
    discount_type: str = "fixed"
    discount_value: float = 0
    max_discount: Optional[float] = None
    min_order_value: float = 0
    free_delivery: bool = False
    product_id: Optional[str] = None
    category_id: Optional[str] = None
    package_id: Optional[str] = None
    target_type: str = "all"
    customer_ids: List[str] = []
    segment: Optional[str] = None
    location_ids: List[str] = []
    conditions: dict = {}
    priority: int = 0
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    usage_limit_per_customer: int = 1
    shareable: bool = False
    is_active: bool = True




# ---------- Auth ----------
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str = Field(min_length=6)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None


# ---------- Address ----------
class AddressInput(BaseModel):
    label: str = "Home"
    full_name: str
    phone: str
    line1: str
    line2: Optional[str] = ""
    city: str
    area: Optional[str] = ""
    pincode: str
    location_id: str
    is_default: bool = False


# ---------- Location ----------
class LocationInput(BaseModel):
    name: str
    city: str
    area: str
    is_active: bool = True
    delivery_available: bool = True
    delivery_charge: float = 0
    min_order_value: float = 0
    pincodes: List[str] = []


# ---------- Delivery settings ----------
class DeliverySettingsInput(BaseModel):
    operating_start: str = "09:00"
    operating_end: str = "21:00"
    slot_duration_minutes: int = 60
    prep_time_minutes: int = 90
    max_orders_per_slot: int = 10
    asap_enabled: bool = True
    asap_charge: float = 100
    holidays: List[str] = []


# ---------- Category ----------
class CategoryInput(BaseModel):
    name: str
    description: Optional[str] = ""
    image_url: Optional[str] = ""
    parent_id: Optional[str] = None
    display_order: int = 0
    is_active: bool = True


# ---------- Product ----------
class ProductInput(BaseModel):
    name: str
    description: Optional[str] = ""
    category_id: str
    subcategory_id: Optional[str] = None
    images: List[str] = []
    pack_size: str = ""
    unit: str = ""
    mrp: float = 0
    selling_price: float = 0
    sku: str = ""
    is_active: bool = True
    is_featured: bool = False
    location_ids: List[str] = []


# ---------- Inventory ----------
class InventoryInput(BaseModel):
    product_id: str
    location_id: str
    available_quantity: int = 0
    low_stock_threshold: int = 5


# ---------- Cart ----------
class CartItemInput(BaseModel):
    product_id: str
    location_id: str
    quantity: int = 1


class CartUpdateInput(BaseModel):
    location_id: str
    quantity: int


# ---------- Coupon ----------
class CouponInput(BaseModel):
    code: str
    discount_type: str = "percentage"  # percentage | fixed
    discount_value: float = 0
    min_order_value: float = 0
    max_discount: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: bool = True
    location_ids: List[str] = []
    category_ids: List[str] = []


class CouponValidateInput(BaseModel):
    code: str
    location_id: str
    subtotal: float


# ---------- Package ----------
class PackageInput(BaseModel):
    name: str
    description: Optional[str] = ""
    image_url: Optional[str] = ""
    package_type: str = "bundle"  # bundle | monthly | promotional
    product_ids: List[str] = []
    price: float = 0
    is_active: bool = True
    location_ids: List[str] = []


# ---------- Order ----------
class OrderInput(BaseModel):
    location_id: str
    address_id: str
    delivery_type: str = "slot"  # slot | asap
    slot_id: Optional[str] = None
    payment_method: str = "cod"  # cod | razorpay
    coupon_code: Optional[str] = None


class OrderStatusUpdate(BaseModel):
    status: str


# ---------- Settings ----------
class BusinessSettingsInput(BaseModel):
    store_name: Optional[str] = None
    support_phone: Optional[str] = None
    support_email: Optional[str] = None
    currency: Optional[str] = None
    cod_enabled: Optional[bool] = None
    online_payment_enabled: Optional[bool] = None


# ---------- Combo Banner ----------
class ComboBannerInput(BaseModel):
    package_id: Optional[str] = None
    title: str
    subtitle: Optional[str] = ""
    promo_text: Optional[str] = ""
    cta_text: str = "View Combo"
    image_url: str = ""
    display_order: int = 0
    is_active: bool = True
    location_ids: List[str] = []
    start_date: Optional[str] = None
    end_date: Optional[str] = None
