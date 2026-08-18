# Freshly — Multi-Location Grocery Ecommerce Platform (PRD)

## Original Problem Statement
Production-ready online grocery ecommerce platform: responsive customer website, customer mobile app, secure admin dashboard, and a shared backend/database. Sells packaged groceries & dry fruits/nuts in India with local slot-based delivery. Must be multi-location from day one, with flexible product/category/inventory/order/delivery-slot/coupon/package architectures. JWT auth with separated customer/admin roles. Payment architecture (Razorpay + COD). Not a static demo — real APIs, DB models, and functional frontend.

## User Choices
- Auth: JWT-based custom auth (httpOnly cookies + Bearer fallback for mobile)
- Mobile: separate React Native (Expo) scaffold, same backend
- Images: upload architecture; seeded sample images used as realistic demo data
- Seed data: yes (1 location, 9 categories, 28 products, inventory, coupons, admin)
- Payments: Razorpay + COD (Razorpay keys pending from user)

## Architecture
- Backend: FastAPI (modular routers under `/api`) + MongoDB (motor). `core/db.py`, `core/security.py`, `models.py`, `seed.py`, `routers/*`.
- Frontend: React (CRA + craco, `@/` alias), Tailwind, shadcn/ui, sonner, framer-motion. Storefront + Admin in one app with route separation.
- Mobile: `/app/mobile` Expo React Native scaffold consuming the same API.
- Auth: JWT httpOnly cookies; `require_admin` guards all `/api/admin/*`. Brute-force lockout keyed per account (works behind ingress).

## User Personas
- Customer: browses by location, shops, checks out with slot or ASAP delivery, pays COD/online.
- Admin (owner prudhvirajm847@gmail.com): manages products, categories, inventory, locations, orders, delivery/slots, coupons, packages, customers, payments, settings.

## Core Requirements (static)
Multi-location; dynamic categories; location-based inventory with safe reservation; slot-based delivery with configurable operating hours/slot duration/prep lead time/capacity/holidays; configurable ASAP (+₹100) priority delivery; orders with 7 statuses; coupons; packages/bundles; payment states (pending/paid/failed/refunded/COD); role separation.

## Implemented (2026-06)
- JWT auth: register/login/logout/me/refresh, profile, per-account brute-force lockout (verified 429).
- Locations CRUD (auto-creates delivery settings); public active listing.
- Categories dynamic CRUD with ordering/active.
- Products CRUD with location availability; auto inventory rows; enrich with stock/discount.
- Location inventory (available/reserved/sold/low-stock/out-of-stock) with atomic reserve + rollback; admin upsert.
- Cart per user+location with stock guard (409), totals; wishlist.
- Delivery slot generation (Asia/Kolkata), lead-time gating, capacity checks; ASAP availability; admin settings.
- Orders: COD checkout with inventory reservation, coupon + delivery + ASAP charges, status history; admin status transitions (cancel restores stock, delivered marks COD paid).
- Coupons validate (WELCOME50 fixed, SAVE10 % w/ cap) + admin CRUD.
- Packages architecture + admin CRUD.
- Payments: Razorpay create-order/verify/webhook (graceful 503 until keys set) + config endpoint; COD fully working.
- Business settings (store info, COD/online toggles).
- Admin dashboard stats + customers list.
- Storefront: home (hero, categories, featured), product listing/search/filter, product detail, cart drawer, checkout (address, slots, ASAP, COD/Razorpay), orders + detail, account (profile + addresses), wishlist, location modal.
- Admin dashboard: 12 sections, all functional.
- Mobile scaffold: Expo app (auth, home, products) on shared API.
- Verified: 33/34 backend pytest pass (1 skipped by IST window); brute-force + admin login re-verified via curl.

## Backlog / Remaining
- P0: Add Razorpay live/test keys (RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET) to enable online payments; complete webhook order-status update.
- P1: Next-day slot selection when today is full; MongoDB transactions for inventory races; coupon date tz-awareness.
- P2: Product image upload to object storage; batched inventory lookups ($lookup) for large catalogs; monthly subscription packages; order notifications (email/SMS).

## Test Credentials
- Admin: prudhvirajm847@gmail.com / Admin@12345
- Customer: customer@test.com / Test@12345

## Next Tasks
1. Collect Razorpay keys and enable online payments end-to-end.
2. Add product/category image uploads.
3. Next-day delivery slot support at checkout.

## Iteration 5 (2026-06) — Personalized Offers & Customer Segmentation
- New collections: `campaigns`, `personalized_coupons`, `personalization_settings`. Order docs gained `campaign_id`, `free_delivery_applied`.
- Backend `personalization.py`: per-customer metrics (order count, spend, AOV, recency, product/category affinity, combo count) → 9 configurable segments (new/active/repeat/high_value/inactive/at_risk/monthly_combo/dry_fruit/frequent_grocery). Server-side eligibility engine with target types (all/segment/individual/multiple/location) + conditions (not_ordered_days, min_aov, min_total_spend, min_orders, purchased_product/category/combo).
- Admin: segment counts, configurable thresholds, campaign CRUD, eligible preview, issue unique per-customer coupons (linked to customer/campaign/offer/location/expiry/usage/shareable), analytics (targeted/eligible/issued/redeemed/orders/revenue/discount/AOV/conversion/free-delivery), Customer-360 offers endpoint.
- Customer: `GET /me/offers`, `/me/buy-again` (in-location, in-stock, ranked by frequency+recency), `/me/personalized-home`. Personalized coupons validated & redeemed server-side in checkout; owner-only unless shareable; free-delivery zeroes delivery charge.
- Frontend: home "Offers for you" + "Buy Again" (hidden when no history), "My Coupons" page + header/account link, admin "Personalized Offers" page (segments bar, campaign create, issue, analytics modal).
- Verified via curl: segments (8 customers), campaign→8 eligible→8 issued, analytics, customer sees their ₹150 coupon. Frontend compiles clean. Existing flows untouched.

## Iteration 4 (2026-06) — Banner scheduling, drag-reorder, savings ribbon, Offers page (all verified 17/17).

## Iteration 3 (2026-06) — Monthly Combo Hero Carousel
- Backend `combo_banners` collection + `GET /api/combo-banners?location_id` (active only, location-filtered: empty location_ids = all locations, else membership; sorted by display_order; capped at 5; enriched with package price/savings/item_count). Admin CRUD `/api/admin/combo-banners` (role-guarded). `GET /api/packages/{id}` combo detail with products + items_value + savings.
- `ComboBannerInput` model; seed of 3 monthly combos + 3 all-location banners (prices tuned so savings show).
- Storefront: `ComboCarousel` (embla + 4.5s autoplay pausing on drag, swipe, pagination dots) on Home after hero, hidden when empty. `/combo/:id` detail page with "Add Combo to Cart".
- Admin: "Combo Banners" section — create/edit/delete, link a Monthly Combo, image upload, title/subtitle/promo/CTA/order/active + per-location visibility, live preview.
- Mobile: `HomeScreen` FlatList paged carousel with autoplay + dots.
- Verified 17/17 backend tests + all frontend flows (iteration_3). Location filtering, max-5 cap, hide-when-empty, ordering, activate/deactivate, admin guard all pass.

## Iteration 2 (2026-06) — Added
- **Image uploads** (Emergent object storage): admin `POST /api/admin/upload` (admin-guarded, 5MB, image-only) → public URL served via `GET /api/files/{path}`; `ImageUpload` component wired into admin Products & Categories with live previews. Verified 44/44 tests.
- **Next-day slots**: `GET /api/delivery/slots/range?days=N` (IST); checkout now shows date tabs (Today/Tomorrow/…) and can place next-day slot orders. Auto-selects first day with availability.
- **Order alerts**: Email via managed Resend (server-side templates + safety gate) + SMS via Twilio; `notify_order()` fires on order create ('pending') and every admin status change. Best-effort/non-blocking.
- **Razorpay**: fully wired (create-order/verify/webhook); activates when `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are set. Twilio SMS activates when `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER` are set. Until then, COD + email work; Razorpay returns a graceful 503 and SMS silently skips.


## Iteration 5 (2026-06) — MASTER PRODUCTION UPDATE (tested 36/36 backend + all admin frontend flows, iteration_4)
Extended (not rebuilt) the existing app safely. IDs remain uuid strings (gen_id); users use ObjectId with user_id = str(_id).

### Phase 1 — Catalog & Location
- `Brand` model + `brands` collection + router (`GET /api/brands`, admin CRUD `/api/admin/brands`).
- Subcategories via `categories` collection with `parent_id`: `GET /api/subcategories?category_id=`, `GET /api/admin/subcategories`. Parent `/categories` now returns parent-only. Product create requires category_id + subcategory_id (brand optional).
- `Product` gained `brand_id` + `cost_price` (for profitability). Product filters add subcategory_id/brand_id.
- PIN code serviceability: `pincodes` collection + router. Public `GET /api/pincodes/check?pincode=` → parent location + min order + delivery charge + PIN-specific discount. Admin CRUD `/api/admin/pincodes` (rejects duplicates).
- Idempotent seed backfill: brands, subcategories, pincodes (from location pincodes), product cost_price (72% of SP), and existing order-item cost/category/brand snapshots so analytics is meaningful.

### Phase 2 — Admin reorg into exactly 8 sections
AdminLayout grouped nav: Dashboard, Orders, Catalog & Inventory (Products/Categories/Subcategories/Brands/Inventory/Monthly Combos/Combo Banners), Sales & Analytics, Coupons & Discounts (Coupons/Personalized Offers), Customer Info, Delivery Info & Stats (Locations/PIN Codes/Delivery & Slots/PIN-wise Stats), Personal Settings (Business Settings/Payments).

### Phase 3 — Orders & Delivery Tracking
- Internal statuses: pending→accepted→confirmed→preparing→ready_for_delivery→out_for_delivery→delivered / cancelled. Customer-facing map via `customer_status`.
- New orders start `accepted=false`; `GET /api/admin/orders/pending-count` powers high-priority alert (AdminOrders beep + vibrate + red banner, 15s poll). `PUT /api/admin/orders/{id}/accept`.
- Optional manual tracking link (rapido/google_maps/other) via `PUT /api/admin/orders/{id}/tracking` — editable anytime.
- Detailed order page `AdminOrderDetail.js` (replaces popup): items, payment summary, timeline, accept/status/tracking.

### Phase 4 — Sales & Analytics (Financial Control Center) — `analytics.py`
- `/api/admin/analytics/overview` (net_revenue, cogs, gross_profit, margin%, gateway_fees ~2%, refunds, expenses, contribution, estimated_profit, delivery_revenue, asap_revenue).
- `/products` (profitability by product/category/brand), `/carts` (in-cart + abandoned + value), `/coupons`, `/payments`, `/pin-stats` (PIN-wise orders/sales/AOV/customers/asap).
- Expenses CRUD `/api/admin/expenses`. `AdminAnalytics.js` + `AdminDeliveryStats.js`.

### Phase 5 — Coupon stacking & bulk
- `CouponInput.coupon_type` (product|delivery) + `delivery_scope` (normal|asap|both) + usage limits. Server rule enforced in `/api/coupons/validate`: max 1 product + 1 delivery coupon (applied_codes checked). Delivery coupon discounts normal/asap/both per scope.
- `OrderInput.delivery_coupon_code`; order create applies BOTH coupons; stores delivery_discount/delivery_coupon_code. Checkout supports stacked coupons.
- Bulk generator `POST /api/admin/coupons/bulk` (up to 5000 unique). No arbitrary limits anywhere.

### Phase 6 — Wallet, Referral, Customer 360
- Wallet ledger (`wallet_ledger`): `GET /api/me/wallet`, admin `GET /api/admin/wallet/{uid}` + `POST /api/admin/wallet/adjust`. Cancelling a PAID order auto-refunds to wallet (payment_status=refunded), guarded against duplicates.
- Referral: lazy `referral_code` on users; `GET /api/me/referral`; `POST /api/referral/apply?code=` credits referrer ₹100 + referee ₹50 (rejects self/duplicate).
- Customer 360 `GET /api/admin/customers/{uid}/full`: profile, summary, orders, behaviour, addresses, coupons, wallet ledger, referrals, abandoned carts. `AdminCustomerDetail.js` with wallet adjust/refund.

### Backlog / P2 (from iteration_4 code review — non-blocking)
- Batch N+1 product lookups ($in) in analytics/carts, customer_360, order create, coupon validate.
- Wallet balance_after recompute is O(n)/race-prone → use atomic $inc on a wallet doc; add unique index on (order_id, reason=refund).
- customers.favourite_products keyed by name (collision risk) → key by product_id.
- Move RAZORPAY_FEE_PCT to settings; pincode update should re-validate location_id.
- Customer-facing wallet/referral UI pages + order tracking display + PIN serviceability check at checkout (backend ready).
- Mobile app: still a scaffold; new features NOT yet ported.
