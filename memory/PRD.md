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
