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
