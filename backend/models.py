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


class ReturnCreateInput(BaseModel):
    order_id: str
    product_id: str
    quantity: int = 1
    type: str  # "refund" | "replacement"
    reason_id: str
    description: Optional[str] = None
    photos: List[str] = []


class ReturnStatusUpdateInput(BaseModel):
    status: str
    note: Optional[str] = None
    refund_amount: Optional[float] = Field(default=None, gt=0)
    refund_method: Optional[str] = None


class ReturnReasonInput(BaseModel):
    label: str
    is_active: bool = True
    requires_photo: bool = True


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None


class PhoneOtpSendInput(BaseModel):
    phone: str


class PhoneOtpVerifyInput(BaseModel):
    phone: str
    otp: str


# ---------- Notifications ----------
class DeviceTokenInput(BaseModel):
    token: str = Field(min_length=10, max_length=4096)
    platform: str = "android"          # android | ios | web
    device_id: Optional[str] = None


class NotificationComposeInput(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=1000)
    image: Optional[str] = None
    deep_link: Optional[str] = None            # e.g. /orders/{id}, /product/{id}, /offers
    type: str = "announcement"                 # announcement | offer | order | payment | refund | general
    target_type: str = "all"                   # all | selected | segment
    customer_ids: List[str] = []
    segment: Optional[str] = None              # new | active | inactive | high_value | with_wallet
    scheduled_at: Optional[str] = None         # ISO8601; empty/near-now = send immediately


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
    latitude: Optional[float] = None
    longitude: Optional[float] = None
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
    holidays: List[str] = []


# ---------- Category ----------
class CategoryInput(BaseModel):
    name: str
    description: Optional[str] = ""
    image_url: Optional[str] = ""
    parent_id: Optional[str] = None
    display_order: int = 0
    is_active: bool = True


# ---------- Brand ----------
class BrandInput(BaseModel):
    name: str
    description: Optional[str] = ""
    logo_url: Optional[str] = ""
    display_order: int = 0
    is_active: bool = True


# ---------- Subcategory ----------
class SubcategoryInput(BaseModel):
    name: str
    description: Optional[str] = ""
    image_url: Optional[str] = ""
    category_id: str
    display_order: int = 0
    is_active: bool = True


# ---------- PIN Code ----------
class PinCodeInput(BaseModel):
    pincode: str
    location_id: str
    area_name: Optional[str] = ""
    is_serviceable: bool = True
    express_enabled: bool = False              # "Get in 30 Minutes" — off unless admin enables per PIN
    express_charge: Optional[float] = None     # 30-minute delivery charge for this PIN
    min_order_value: float = 0
    delivery_charge: Optional[float] = None
    free_delivery_threshold: Optional[float] = None
    discount_type: Optional[str] = None       # percentage | fixed | None
    discount_value: float = 0
    max_discount: Optional[float] = None
    notes: Optional[str] = ""


# ---------- Product ----------
class ProductInput(BaseModel):
    name: str
    description: Optional[str] = ""
    category_id: str
    subcategory_id: Optional[str] = None
    brand_id: Optional[str] = None
    images: List[str] = []
    pack_size: str = ""
    unit: str = ""
    mrp: float = 0
    selling_price: float = 0
    cost_price: float = 0
    sku: str = ""
    is_active: bool = True
    is_featured: bool = False
    location_ids: List[str] = []


# ---------- Inventory ----------
class InventoryInput(BaseModel):
    product_id: str
    location_id: Optional[str] = None
    pincode: Optional[str] = None
    available_quantity: int = 0
    low_stock_threshold: int = 5
    enabled: bool = True


class BulkEnableInput(BaseModel):
    pincodes: List[str] = []
    all_serviceable: bool = False
    enabled: bool = True
    set_stock: Optional[int] = None


class CopyInventoryInput(BaseModel):
    from_pincode: str
    to_pincodes: List[str] = []


# ---------- Cart ----------
class CartItemInput(BaseModel):
    product_id: str
    location_id: str
    pincode: Optional[str] = None
    quantity: int = 1


class CartUpdateInput(BaseModel):
    location_id: str
    pincode: Optional[str] = None
    quantity: int


class ComboCartInput(BaseModel):
    location_id: str
    pincode: Optional[str] = None
    combo_id: str
    selections: Dict[str, dict] = {}   # {original_pid: {"product_id": chosen_id, "quantity": q}}


class ComboCartUpdateInput(BaseModel):
    location_id: str
    pincode: Optional[str] = None
    selections: Dict[str, dict] = {}


# ---------- Coupon ----------
class CouponInput(BaseModel):
    code: str
    coupon_type: str = "product"        # product | delivery
    delivery_scope: str = "both"        # normal | express | both (only for delivery coupons)
    discount_type: str = "percentage"   # percentage | fixed
    discount_value: float = 0
    min_order_value: float = 0
    max_discount: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: bool = True
    location_ids: List[str] = []
    category_ids: List[str] = []
    pin_codes: List[str] = []                     # PIN-code targeting (empty = all serviceable PINs)
    target_user_ids: List[str] = []              # specific customer targeting (empty = all)
    usage_limit: Optional[int] = None            # total redemptions allowed
    usage_limit_per_customer: Optional[int] = None
    campaign_tag: Optional[str] = None           # groups bulk-generated coupons


class BulkCouponInput(BaseModel):
    prefix: str = "SAVE"
    count: int = 10
    coupon_type: str = "product"
    delivery_scope: str = "both"
    discount_type: str = "percentage"
    discount_value: float = 0
    min_order_value: float = 0
    max_discount: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    location_ids: List[str] = []
    usage_limit: Optional[int] = 1
    usage_limit_per_customer: Optional[int] = 1
    campaign_tag: Optional[str] = None


class CouponValidateInput(BaseModel):
    code: str
    location_id: str
    subtotal: float
    delivery_charge: float = 0
    express_charge: float = 0
    applied_codes: List[str] = []


# ---------- Expense ----------
class ExpenseInput(BaseModel):
    title: str
    category: str = "operations"   # operations | marketing | logistics | salaries | rent | other
    amount: float = 0
    location_id: Optional[str] = None
    date: Optional[str] = None
    notes: Optional[str] = ""


# ---------- Wallet ----------
class WalletAdjustInput(BaseModel):
    user_id: str
    amount: float                  # positive = credit, negative = debit
    reason: str = "adjustment"
    order_id: Optional[str] = None
    notes: Optional[str] = ""


# ---------- Package ----------
class PackageInput(BaseModel):
    name: str
    description: Optional[str] = ""
    image_url: Optional[str] = ""
    package_type: str = "bundle"  # bundle | monthly | promotional
    product_ids: List[str] = []
    swap_options: dict = {}       # {original_product_id: [approved_alternative_product_ids]}
    item_config: dict = {}        # {pid: {qty_editable, swap_allowed, min_qty, max_qty, default_qty}}
    price: float = 0
    is_active: bool = True
    location_ids: List[str] = []


# ---------- Order ----------
class OrderInput(BaseModel):
    location_id: str
    address_id: str
    delivery_type: str = "slot"  # slot | express
    slot_id: Optional[str] = None
    payment_method: str = "cod"  # cod | razorpay
    coupon_code: Optional[str] = None
    delivery_coupon_code: Optional[str] = None
    use_wallet: bool = False


class OrderStatusUpdate(BaseModel):
    status: str


class OrderTrackingInput(BaseModel):
    tracking_url: str
    tracking_provider: Optional[str] = ""   # rapido | google_maps | other


# ---------- Settings ----------
class BusinessSettingsInput(BaseModel):
    store_name: Optional[str] = None
    support_phone: Optional[str] = None
    support_email: Optional[str] = None
    currency: Optional[str] = None
    cod_enabled: Optional[bool] = None
    online_payment_enabled: Optional[bool] = None
    # Wallet rewards
    cashback_enabled: Optional[bool] = None
    cashback_percent: Optional[float] = None
    cashback_max: Optional[float] = None
    milestone_enabled: Optional[bool] = None
    milestone_rewards: Optional[dict] = None          # {"5": 100, "10": 250}
    # Wallet withdrawals
    withdrawals_enabled: Optional[bool] = None
    min_withdrawal: Optional[float] = None
    withdrawable_sources: Optional[List[str]] = None   # e.g. ["topup", "refund"]
    # Loyalty tiers
    loyalty_enabled: Optional[bool] = None
    loyalty_tiers: Optional[List[dict]] = None         # [{name, min_orders, cashback_percent}]


class WalletTopupInput(BaseModel):
    amount: float


class WalletWithdrawInput(BaseModel):
    amount: float
    method: str = "upi"                # upi | bank
    upi_id: Optional[str] = None
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc: Optional[str] = None


class WithdrawalStatusInput(BaseModel):
    status: str                        # approved | processing | completed | rejected | failed
    admin_note: Optional[str] = ""


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
