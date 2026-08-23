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


## Iteration 6 (2026-06) — Customer-facing Wallet / Referral / PIN check / Live Tracking (tested frontend 6/6 PASS, iteration_5; backend curl-verified)
- **Wallet** (`/wallet`, `Wallet.js`): balance card + full ledger (credits/refunds/order payments). Backend `GET /api/me/wallet`. Checkout "Use wallet balance" toggle (`OrderInput.use_wallet`) partially/fully pays; order create records an `order_payment` debit ledger entry and stores `wallet_used`. Verified: 1398+40+100−300 wallet = 1238; balance 300→0.
- **Refer & Earn** (`/referral`, `Referral.js`): shareable code (lazy-generated), copy/native-share, apply a friend's code (`POST /api/referral/apply?code=`) crediting referrer ₹100 + referee ₹50; self/duplicate rejected. Clipboard/share wrapped in try/catch.
- **PIN serviceability** (`LocationModal.js`): enter PIN → `GET /api/pincodes/check` → shows serviceable + parent location + min order + delivery fee + area discount, or "we don't deliver" message; "Shop this area" sets location.
- **Live Order Tracking** (`Orders.js`): customer_status badges; order detail shows a 6-step journey timeline with timestamps (from status_history) and a "Live tracking" button linking to the admin-set Rapido/Maps tracking_url when out_for_delivery. Order summary now shows delivery-coupon + wallet lines.
- Header account menu gained "My Wallet" + "Refer & Earn"; routes `/wallet` `/referral` (protected).
- Backlog still open: customer-facing wallet UI error-retry; LocationModal aria-describedby; plus all P2 items from iteration 5 (N+1 batching, atomic wallet balance, mobile app port).

## Iteration 7 (2026-06) — Wallet Add-Money/Withdrawal, Cashback/Milestone, Admin Nav expansion (tested: backend 12/12 pytest + frontend 8-group nav, iteration_6)
### Wallet Add Money (Razorpay top-up)
- `POST /api/me/wallet/topup/create-order` (Razorpay order) → `POST /api/me/wallet/topup/verify` (signature verify). Idempotent: credits once per payment_id; `wallet_topups` collection tracks status. Source-tagged `topup`. Razorpay keys MOCKED → create-order returns graceful 503.
### Wallet ledger credit types + withdrawability
- Every ledger entry now carries `txn_id`, `source` (topup|refund|referral|promotional|admin_credit|cashback|milestone|order_payment|withdrawal), `withdrawable`, `status`, `payment_ref`. `withdrawable_balance` = min(total, Σ withdrawable-source credits − active withdrawal holds), driven by `settings.withdrawable_sources` (default topup+refund). Admin adjust tags admin_credit; referral=referral (not withdrawable by default).
### Wallet Withdrawal
- `POST /api/me/wallet/withdraw` (UPI/bank) validates min + eligible balance, places a ledger hold (source=withdrawal, status=pending). Statuses: pending→approved→processing→completed / rejected / failed. Admin: `GET /api/admin/withdrawals`, `PUT /api/admin/withdrawals/{id}/status`. Reject/fail CANCELS the hold entry (status=cancelled, excluded from balance & held) → amount + withdrawability restored (verified). Complete finalizes hold.
- Admin `GET /api/admin/wallet/overview/balances` (per-customer balances + total liability). `AdminWalletManagement.js`.
### Cashback + Milestone rewards
- On order → delivered, `_grant_rewards` credits cashback (settings cashback_percent, capped cashback_max; idempotent per order_id) + milestone rewards (settings milestone_rewards {5,10}; deduped by note). Verified ₹19.18 cashback.
### Analytics additions
- `GET /api/admin/analytics/wallet` (liability, credited/debited, by_source, topups, withdrawals_by_status) and `/api/admin/analytics/referrals` (top referrers, reward paid).
### Admin navigation — 8 top-level sections, each sub-item opens a real working page
- Catalog & Inventory (7), Sales & Analytics (10 sub-items → `/admin/analytics?tab=` incl referrals/wallet/reports), Coupons & Discounts (7: Campaigns, Create[dialog], Bulk[dialog], Product/Order, Delivery, ASAP[filtered], Personalized→campaigns), Customer Info (Customers, 360, Behaviour, Abandoned Carts, Wallet Management), Delivery Info & Stats (Locations, PIN Codes, Delivery Charges/Slots/ASAP via `?section=`, PIN-wise Stats), Personal Settings (Business Settings, Payments). AdminCoupons reads `?action/?type/?scope`; AdminAnalytics reads `?tab`; AdminDelivery reads `?section`.
- New settings: cashback %/max/enabled, milestone rewards, withdrawals_enabled, min_withdrawal, withdrawable_sources chips (AdminSettings.js).
### Backlog (P2, from iteration_6 review — non-blocking)
- Make wallet_balance/withdrawable atomic ($inc on a wallet doc) — currently O(n) full-ledger scan per call (race-prone); admin_wallet_balances is O(N*M) → use $group aggregation.
- Milestone dedup by order_id (not note); wrap request_withdrawal ObjectId in try/except; persist DEFAULTS on first settings read.
- Frontend testid aliases (submit-withdraw-btn vs withdraw-submit) — cosmetic.
- Mobile app still a scaffold — new features NOT ported.


## Iteration 8 (2026-06) — Withdrawal Alerts, Loyalty Tiers, Combo Editing (backend curl-verified + frontend smoke-tested)
### Withdrawal Alerts (email)
- `update_withdrawal` sends a Resend email (via notifications.send_email, safety-gated) on approved / completed / rejected / failed with request id + amount. EMAIL_KEY IS configured → emails send.
### Loyalty Tiers
- Settings: `loyalty_enabled` + `loyalty_tiers` [{name,min_orders,cashback_percent}] default Bronze(0,2%)/Silver(5,3%)/Gold(15,5%). `settings.loyalty_tier_for(count)` helper. `_grant_rewards` cashback now uses the customer's tier rate (by delivered-order count, capped by cashback_max). `GET /api/me/wallet` returns `loyalty` {orders, tier, cashback_percent, next_tier, orders_to_next}; Wallet page shows a tier badge + progress. Tiers editable in AdminSettings (loyalty defaults surfaced; extend UI later if needed).
### Combo Editing (admin-approved swaps + auto price adjustment)
- `PackageInput.swap_options` {original_pid: [approved_alt_pids]}. `GET /api/packages/{id}` attaches `alternatives` + `swappable` per product. AdminPackages create form configures approved alternatives per product (pkg-swapcfg/pkg-alt testids). ComboDetail lets customers swap each swappable item to an approved alternative; effective combo price auto-adjusts by the price difference (verified: ₹500 → ₹221 after swapping to a cheaper Kolam Rice, "-₹279 with your swaps"); add-to-cart adds the chosen set.
### Backlog (P2, unchanged + new)
- AdminSettings: expose full loyalty-tier editor (add/remove tiers) — currently defaults + backend editable via API.
- Combos add items at individual prices in cart (curated-list model), so combo bundle price isn't enforced as a single cart line — consider a true bundle cart item if strict combo pricing is required.
- Prior P2s: atomic wallet balance, milestone dedup by order_id, mobile app port (still scaffold).


## Iteration 9 (2026-06) — Search Results filters + duplicate-category fix (testing_agent VERIFIED 14/14 backend + all frontend flows, iteration_7)
- **Category dedupe**: `_dedupe_by_name` in categories.py collapses duplicate category/subcategory records on READ (by name+parent_id) — fixes "Home needs" showing twice; DB records untouched (no deletes). `/categories` now returns 10 unique names.
- **Brand-aware search**: products.py `/products` search now matches product name, sku, description AND brand name (`$or` with brand_ids lookup). Existing name search + category filter preserved.
- **New filter params**: `min_price`, `max_price` (Mongo query), `min_discount`, `in_stock` (post-enrich). subcategory_id/brand_id/category_id all combinable.
- **Search page rewrite** (Products.js): proper filter experience — Category (single, URL param), Subcategory + Brand (multi, checkboxes), Price slider, Discount chips (10/25/50), In-stock toggle, Clear all + active-filter chips + results count. Desktop left sidebar; mobile Filter button → Sheet drawer. Subcategory/brand facets are RELEVANT (derived from current result set only). ProductCard/pricing/discount/wishlist preserved.
- Backlog (P2): persist discount_percent server-side or compute Mongo-side for large catalogs; add unique compound index (name-lower, parent_id) to block future duplicate category inserts (write-side).


## Iteration 10 (2026-06) — 9-area consolidation (testing_agent VERIFIED 17/17 backend + frontend smoke, iteration_8)
1. **PIN serviceability enforced end-to-end**: `PinCodeInput` gained `asap_enabled` + `free_delivery_threshold`; `/pincodes/check` returns them. `addresses.py` `_assert_serviceable` rejects unserviceable PINs on create/update and auto-sets location_id to the PIN's location. Order creation looks up the PIN, rejects unserviceable, uses PIN delivery_charge/min_order/free_threshold, and gates ASAP by `pin.asap_enabled`.
2. **Category/Subcategory**: create rejects duplicates (case-insensitive name+parent); `/categories` & `/subcategories` deduped on read.
3. **Inventory**: reserve on order / restore on cancel / 409 on out-of-stock (existing, re-verified).
4. **Admin delivery charges**: per-PIN charge + free-delivery threshold; ASAP separate from delivery in totals. AdminPinCodes UI adds ASAP toggle + free-threshold.
5. **Combo edit/swap**: existing (iteration 8/9).
6. **Available Coupons**: `GET /api/coupons/available` returns eligible-only coupons filtered by date, location, PIN targeting (CouponInput.pin_codes), customer targeting (target_user_ids), min order — with eligible flag + reason. Checkout shows the list with one-tap Apply; stacking (1 product + 1 delivery) + separate discount lines preserved. AdminCoupons UI adds Valid from/until + target PINs.
7. **Wallet**: balance reconciles with ledger; entries carry date/credit-debit/amount/source/ref/balance_after (existing, re-verified).
8. **Referral**: anti-self + duplicate prevention verified.
## Iteration 11 (2026-06) — Monthly Combo: full Edit/Swap + single bundle cart line
- **Admin per-item controls** (`PackageInput.item_config` {pid:{qty_editable, swap_allowed, min_qty, max_qty, default_qty}}): AdminPackages expand panel now sets qty-editable, min/max/default qty, swap-allowed toggle + approved alternatives. swap_options unchanged.
- **Backend pricing/validation** (`packages.price_and_validate_combo`): validates swap is admin-approved, clamps qty to bounds (non-editable forced to default), checks location inventory (409 if short). Effective price = chosen_value − fixed savings (savings = base_value − pkg.price, constant), clamped ≥0. `GET /packages/{id}?location_id=` returns per-item `config`, `stock`, and alternatives sorted same-subcategory→same-category→price.
- **Single bundle cart line**: cart items now carry `type:"combo"` with `line_id` + stored `selections`. New endpoints `POST /cart/combo`, `PUT /cart/combo/{line_id}`, `DELETE /cart/combo/{line_id}`. `build_cart_response` returns `combos[]` (effective price, savings, resolved items, selections) separate from `items[]`; subtotal = product lines + combo effective prices. Product cart fns hardened with `.get("product_id")`.
- **Order**: create_order expands combo lines into inventory reservation + analytics items (tagged combo_id/combo_name), stores `combos[]` + `combo_discount`; subtotal reflects combo effective price; ASAP stays additive to delivery.
- **Frontend**: ComboDetail rewritten with qty steppers (bounded), swap dialog showing +₹/−₹ + stock, live price/savings, single "Add/Update Combo" → one bundle. CartDrawer shows combo as a collapsible bundle line (Save badge, item list, Edit→`/combo/:id?line=`, Remove). StoreContext gained addCombo/updateCombo/removeCombo.
- Verified via curl e2e: swap+qty combo → 1 cart line (₹641 = chosen ₹1460 − ₹819 savings); order placed, Kolam inventory 100→98 reserved 2, combo_discount ₹819, delivery ₹40 + ASAP ₹100 separate. Frontend combo page screenshot confirms qty stepper on editable item, none on fixed item.

## Iteration 12 (2026-06) — Combo Smart Swap Picks + swap/edit fix
- **Bug**: real seeded combos (Monthly Family/Breakfast/Premium Dry Fruits) had no `swap_options`/`item_config`, so no Swap button or qty stepper appeared → "swap/edit not working". 
- **Fix + feature** (`packages._combo_alternatives`): when swapping is allowed (default true), each item now surfaces admin-approved alternatives first, then smart same-subcategory (then same-category) in-stock suggestions, each tagged `recommended` (same subcategory) + `source` (admin|suggested), sorted recommended→category→admin→price. Items become swappable out-of-the-box.
- **Validation** (`price_and_validate_combo`): accepts a swap if the chosen product is admin-approved OR shares the original's subcategory/category (with `swap_allowed`); unrelated products rejected 400. Verified via curl: Sona Masoori→Kolam Rice 200 (single line, effective ₹949); unrelated→400.
- **Frontend**: swap dialog shows a green "Recommended" badge on same-subcategory picks. Also fixed combo update redirect (→ home instead of bouncing checkout), added swap-dialog DialogDescription (a11y), guarded empty hero img src.
- Verified: real Monthly Family Combo now shows Swap on all 6 items (screenshot); frontend compiles clean.

## Iteration 13 (2026-06) — Combo per-item quantity editing (min 0 = remove)
- Every combo item now has an independent `[−] qty [+]` control on the detail page (no longer gated by admin qty_editable). Min 0; at 0 the item is clearly marked "Removed" (dashed card + badge) and dropped from the bundle.
- Backend `price_and_validate_combo`: quantity 0..(admin max if set)..inventory; qty>stock → 409 "Only N of X in stock"; qty 0 skips the line (base_value/savings basis kept intact). Changing one item never touches others (per-key selections). Cart now echoes raw selections so removals persist through edit.
- Swap preserves the current quantity, clamping down only if the replacement has less stock. Existing swap + smart-suggestions unchanged.
- Cart/checkout/order/inventory reflect final quantities (order reserves each combo item's chosen qty). Verified via curl: Toor Dal→×2 changed only that item; Fortune Oil→0 removed; effective ₹1149 / chosen ₹1331 / savings ₹182; over-stock rejected 409. Frontend compiles clean; steppers render on all items.

## Iteration 14 (2026-06) — PIN-code inventory + PIN-based delivery + availability
- **Inventory re-keyed to PIN**: `inventory` docs now carry `pincode` + `enabled`; unique index migrated to `(product_id, location_id, pincode)`. `resolve_stock(product_id, pincode, location_id)` prefers PIN-level, falls back to legacy location rows (no data loss). Idempotent seed backfill copies each location's stock into every serviceable PIN.
- **Admin inventory** (`inventory.py`): `GET /admin/inventory?pincode=` lists every active product per PIN (enabled/stock/reserved/sold/status); `PUT /admin/inventory` upserts by pincode with `enabled`; `POST /admin/inventory/enable-all` bulk-enables for one/many/all serviceable PINs (optional set_stock); `GET /admin/inventory/summary` per-PIN stats. Verified isolation (500034=50 vs 500073=7), per-PIN disable, enable-all.
- **Customer availability**: `/products?pincode=` returns only products enabled for that PIN, with PIN-level stock (`resolve_stock`). Cart/combo endpoints thread `pincode`; stock checks are PIN-aware.
- **Orders**: reserve/restore/deliver now key inventory by the address's PIN (falls back to location); order stores `pincode`.
- **PIN-based delivery charge (checkout)**: Checkout fetches `/pincodes/check` for the selected address's PIN and uses its `delivery_charge` + `free_delivery_threshold` (no more global ₹40); ASAP surcharge stays separate/additive; ASAP option hidden when the PIN disables it. Delivery coupons/stacking untouched.
- **Frontend**: StoreContext tracks `pincode` (persisted) and threads it everywhere; LocationModal "Shop this area" sets the PIN; Products lists by PIN; Admin Inventory rebuilt with PIN selector + search + status filter + Enable-All + per-row enable toggle.
- Serviceability/address/checkout validation (reqs 1/6/7) already enforced server-side and preserved.

## Iteration 15 (2026-06) — Admin permanent side navigation (12 sections)
- Rebuilt `AdminLayout` sidebar into 12 flat top-level sections (Dashboard, Orders, Analytics, Products, Inventory, Coupons & Discounts, Customers, Delivery/PIN Codes, Combos & Banners, Referrals, Wallet, Settings) with lucide icons, active-route highlighting (incl. child routes), and expandable sub-links per domain. **Inventory is now its own top-level section, separate from Products.** No routes removed.
- Mobile: sidebar hidden, hamburger (`admin-mobile-menu`) opens a shadcn Sheet drawer with the same nav; tapping navigates + closes. testids: `admin-sidebar`, `nav-<slug>`, `subnav-<slug>`.
- New Referrals section: backend `GET /admin/referrals` (referrers, referred customers, rewards, anti-self-referral status) + `AdminReferrals` page (`/admin/referrals`) with summary cards, anti-self banner, expandable referrers table.
- Verified: testing_agent iteration_13 — frontend 100% (all 12 links route correctly, active highlight, sub-link expansion, referrals page, mobile drawer, 21 admin routes regress-clean).

## Iteration 16 (2026-06) — Fix: PIN flow always engages + new-PIN inventory + Copy Inventory
- **Root cause of "PIN not working"**: customer init auto-picked a location but never a `pincode`, so PIN-wise inventory/delivery silently fell back to location behaviour. Fixed: StoreContext now derives `pincode` from the location's `pincodes[0]` (or saved PIN) on load and whenever a bare service area is picked — every session now has a PIN. Verified: header shows "Banjara Hills · 500034" even after clearing stored PIN.
- **New PINs had no inventory**: `create_pincode` now auto-provisions PIN-level inventory for all active products (copying the parent location's stock, enabled). Verified: new PIN 520003 immediately lists 30 products, serviceable at ₹60.
- **Copy Inventory**: `POST /admin/inventory/copy {from_pincode, to_pincodes[]}` + Admin Inventory "Copy this PIN → target" control. Verified: 500034→520003 copied 33 rows.
- Address validation already enforced serviceability + auto-associates the PIN's location (req 6, confirmed).
- Admin Customer 360 already shows wallet balance stat + full Wallet ledger tab + adjust/refund (req satisfied).

## Iteration 17 (2026-06) — Admin Dashboard revamp (7 real-data sections)
- Added `GET /admin/dashboard/overview` (routers/admin_misc.py) computing 7 sections from real orders/inventory/wallet/referrals (no mock): (1) Today's Summary — orders/sales/profit/discounts/delivery collected/refunds; (2) Live Orders by status (pending/accepted/packing/out_for_delivery/delivered/cancelled); (3) Sales Trend today/7d/30d with orders/revenue/profit; (4) Inventory Alerts — low/out counts + PIN-wise issues; (5) PIN Performance — orders/sales/customers/delivery per PIN; (6) Customer & Marketing — new customers, cart abandonment, stopped-buying(30d+), coupon usage, referral customers; (7) Financial Snapshot — gross sales, product/coupon discounts, delivery revenue, refunds, wallet credits/debits, referral reward cost, estimated profit. Existing `/admin/dashboard/stats` kept.
- Rewrote AdminDashboard.js into responsive cards/grid (compact on mobile) with click-through links to Orders/Inventory/Analytics/Customers/Referrals; Live-Order status chips navigate to `/admin/orders?status=<s>` (AdminOrders now reads the `status` query param). No detailed analytics duplicated — quick overview + links.
- Verified via curl: all sections return live values (e.g. 30d: 18 orders / ₹24,561 / profit ₹4,691; estimated_profit ₹4,691). Frontend compiles clean.

## Iteration 18 (2026-06) — Sidebar alert badges + dashboard date-range toggle
- **Sidebar badges**: new `GET /admin/dashboard/alerts` (pending_orders, low_stock, out_of_stock). AdminLayout fetches on mount + every 60s and renders a red count badge on the Orders (pending) and Inventory (low-stock) nav items (`nav-badge-orders`, `nav-badge-inventory`). Verified: pending_orders=7 badge.
- **Dashboard date range**: `/admin/dashboard/overview?days=` now re-scopes the whole dashboard (period summary, financial snapshot, PIN performance, coupon usage) to Today/7d/30d; response includes `period` label. AdminDashboard has a Today/7 Days/30 Days toggle (`dashboard-range`, `range-1|7|30`) that refetches. Sales Trend still shows all 3 windows. Verified: days=1→Today/₹500, days=30→Last 30 Days/₹24,321.
- Frontend compiles clean.

### Remaining / manual config (P2)
- Personalized coupons hard-typed as 'product' in stacking calc (fine unless a personalized delivery coupon is added).
- Optional: enforce coupon-type stacking on order create too (currently safe — delivery_coupon_code DB query filters coupon_type='delivery').
- Combo edited-quantity as a single bundle cart line NOT implemented (combo items still add individually); combo qty min/max admin controls pending.
- Referral reward currently credits on apply (not gated by a qualifying delivered order); admin Referral-config UI (reward amounts, min qualifying order, limits) pending.
- Mobile app still a scaffold.


## Iteration 19 (2026-06) — Profile mobile-number OTP verification
- Backend (routers/auth.py): `normalize_indian_phone()` enforces exactly 10 digits starting 6/7/8/9 (+91), rejecting 6/9/11-digit, letters, bad prefixes. New endpoints: `POST /auth/phone/send-otp` (6-digit OTP, sha256-hashed in `phone_otps`, 5-min TTL, 30s resend cooldown, max 5 sends/hr) and `POST /auth/phone/verify-otp` (max 5 attempts; on success sets user.phone + phone_verified=true). `PUT /auth/profile` now REJECTS (403) any phone change that isn't OTP-verified; same verified number needs no OTP. login/register/me now return `phone_verified`. Dev-mode fallback: when Twilio env not set, send-otp returns `dev_otp` (auto-switches to real SMS once keys added).
- Frontend (pages/store/Account.js): Profile tab shows current verified number + Verified/Not-verified badge, +91-prefixed 10-digit input with live validation, "Verify Mobile Number" button, 6-digit OTP entry with resend timer. Email behaviour unchanged.
- Verified via curl (all 9 required cases) + screenshot: 6/9/11-digit + letters + non-6-9-start rejected; valid→OTP; wrong/expired OTP→not changed; correct OTP→changed+verified; direct API phone change→403; unauthenticated→401; resend rate-limited.

## Iteration 20 (2026-06) — Admin Order Detail fixes
- **Analytics 500 fix** (routers/analytics.py): products/carts/abandoned loops now skip line items without `product_id` (combo bundle lines) — previously threw `KeyError: 'product_id'`. All 7 admin analytics endpoints return 200.
- **Payment Summary reconciliation** (AdminOrderDetail.js): summary now derives from the order's item snapshot and reconciles exactly: [Items total − Combo savings =] Subtotal − Coupon + Delivery + ASAP − Delivery coupon − Wallet used = Total payable (final_amount). Added wallet_used, delivery_discount and combo_discount rows; MRP savings shown as an informational note (not a running-total line).
- **Status timeline** (routers/orders.py): `update_order_status` now enforces forward-only ORDER_FLOW (pending→accepted→confirmed→preparing→ready_for_delivery→out_for_delivery→delivered), rejects backward moves and changes after terminal (delivered/cancelled); same-status calls are no-ops. Each status recorded once (dedupe on write in accept + status, and `_dedupe_history` on read). Cancellation handled separately from any non-terminal state. Frontend status dropdown disables backward/terminal-invalid options.
- **Snapshot**: orders already snapshot price/discount/coupon/wallet/PIN delivery at placement (admin product changes never mutate existing orders). Added `customer_phone_verified` to the order snapshot; order detail shows a Verified badge for phone, plus service area, PIN code and slot/ASAP.
- Verified via curl (forward/no-op-dedupe/backward-reject/terminal-reject + financial reconciliation) and a full-page admin screenshot. Test order restored after transition testing (inventory + cashback side-effects reverted).

## Iteration 21 (2026-06) — Refund/Replacement fixes + GPS delivery location
Refund/Replacement bug fixes (from testing iteration_16):
- Backend: refund_amount now validated — Pydantic gt=0 (negative→422) and capped at line_amount (over-cap→400). Duplicate guard now scoped by user_id too.
- Frontend: ReturnFlow clears "Other" description when switching to a non-Other reason; broken empty <img src=''> replaced with placeholder (ReturnFlow + Orders). AdminReturns refund input has min/max + client validation; internal notes can now be added anytime (incl. terminal requests) via a dedicated note box calling POST /admin/returns/{id}/note.

GPS delivery location:
- AddressInput model gains optional latitude/longitude; addresses & order snapshots persist them automatically (order copies full address doc).
- New /app/frontend/src/lib/geo.js: getCurrentPosition (permission requested ONLY on explicit "Use current location", not for browsing) + best-effort Nominatim reverseGeocode (auto-fills pincode/city/area, manual fallback).
- "Use current location" button added to Checkout and Account address dialogs; manual entry preserved. PIN-based serviceability/slots/ASAP logic unchanged.
- Admin order detail: shows GPS coords + Google Maps (dir destination=lat,lng), Rapido/Maps-app (geo: URI for Android chooser), Copy address, and Call (tel:) actions. Falls back to address-text Google Maps search when coords absent.
- ANDROID WebView/TWA note: for geolocation to work in the Android app, the app must declare ACCESS_FINE_LOCATION (and ACCESS_COARSE_LOCATION) and the WebView must grant onGeolocationPermissionsShowPrompt over HTTPS. Website works out of the box on HTTPS.
- Verified: curl (refund caps, address+coords persistence, admin snapshot) + screenshots (admin GPS actions block, Account "Use current location" dialog).

## Iteration 22 (2026-06) — Map Pin Confirm + Website-vs-App Platform Analytics
Map Pin Confirm:
- New /app/frontend/src/components/store/MapPicker.jsx (plain Leaflet, React 19 safe; OSM tiles, CDN marker assets). Draggable pin + click-to-move updates address latitude/longitude; embedded in Checkout & Account add-address dialogs with "Drag the pin to fine-tune the exact drop point." Coords persist to address & order snapshot (from Iteration 21).

Platform Usage (Website vs App) — real data only:
- core/platform.py: client_platform() detects app via X-Client-Platform header (frontend), X-Requested-With (Android WebView package) or UA hints; else web. record_ping() writes deduped (visitor, platform, day) rows.
- routers/usage.py: POST /usage/track (public, deduped) + GET /admin/analytics/platform (days/start/end filters). Metrics from real data: registered_total, active_users, unique_visitors, per-platform users/orders/revenue/new_users/returning_visitors.
- Orders now snapshot `platform`; register stores `signup_platform`; login records a ping + last_platform. Frontend: lib/platform.js (detectPlatform + visitor id), api.js interceptors add X-Client-Platform/X-Visitor-Id to all calls, App.js fires /usage/track once per platform/day (deduped in localStorage). AdminAnalytics adds a "Website vs App" tab (date filter + summary + 2 comparison cards).
- Android note: the TWA/WebView app should set localStorage.platform="app" (or open ?platform=app) OR the WebView sends X-Requested-With package → identified as APP; normal browsers → WEBSITE. Same customer across platforms stays ONE user; orders/usage attributed per platform.
- Verified: curl (web/app detection incl. X-Requested-With, per-day dedupe, analytics attribution app ₹800/1 order vs web, signup_platform=app) + screenshots (platform tab, map picker). Services clean; existing auth/orders/analytics untouched.

## Iteration 23 (2026-06) — Production deployment package (Hostinger VPS)
- Added deploy files only (NO app code changed): backend/Dockerfile (+.dockerignore), frontend/Dockerfile (multi-stage build→nginx) + frontend/nginx.conf (SPA + /api reverse proxy, preserves X-Client-Platform/X-Visitor-Id), deploy/docker-compose.yml (mongo+backend+frontend), deploy/.env.example (all env vars), deploy/README.md (step-by-step Hostinger VPS guide + HTTPS via Cloudflare/Certbot), deploy/nginx-https.conf (optional host TLS).
- Single-domain architecture: nginx serves the SPA and proxies /api→backend:8001 (no CORS issues). REACT_APP_BACKEND_URL baked at build; MongoDB via bundled container OR Atlas.
- Documented self-hosting caveats: Emergent object storage (uploads.py), email (Resend), and LLM key rely on Emergent integrations and need S3/SES/own-key replacement off-platform; Razorpay/Twilio read standard .env keys (blank = COD/OTP-dev). Validated compose YAML + build scripts + backend deps. HTTPS mandatory (secure/SameSite=None cookies).

## Iteration 24 (2026-06) — Razorpay TEST mode configured + full flow tested
- Test keys stored ONLY in backend/.env (RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET) + a RAZORPAY_WEBHOOK_SECRET for testing. Secret never in frontend/source/logs/API responses (create-order & /payments/config return only the publishable key_id, which Razorpay Checkout requires).
- Hardened webhook (routers/payments.py): verifies X-Razorpay-Signature, then processes payment.captured/order.paid (→ paid+confirmed, idempotent) and payment.failed (→ failed); invalid signature → 400.
- SECURITY: added .env ignore patterns to .gitignore (.env, **/.env, keep .env.example) — backend/.env & frontend/.env now git-ignored so keys never reach GitHub.
- Tested end-to-end against the REAL Razorpay TEST API (backend/tests/test_razorpay_flow.py, all pass): config (no secret), create-order (live order_ id, ₹→paise), verify FAIL (bad sig→400, order failed), verify SUCCESS (valid HMAC→paid+confirmed), webhook invalid-sig→400, webhook captured→paid+confirmed, webhook idempotency, webhook failed→failed. Still in TEST mode (no live switch).
- NOTE for production: replace RAZORPAY_WEBHOOK_SECRET with the actual secret from the Razorpay Dashboard webhook config; set the webhook URL to https://<domain>/api/payments/webhook.

## Iteration 25 (2026-06) — Live Razorpay checkout verified + payment receipts + Razorpay refunds
- LIVE browser checkout (testing iteration_17): real Razorpay TEST popup completed with domestic test card 5267 3181 8797 5449 (4111... is rejected as international on this account) -> /payments/razorpay/verify -> order paid+confirmed, cart cleared, shows in My Orders. Abandoned popup stays pending. No key_secret / no rzp_live exposed anywhere.
- Payment receipts: notifications.send_payment_receipt() emails an itemised receipt once payment is confirmed; called from /payments/razorpay/verify AND webhook payment.captured, idempotent via order.receipt_sent flag. (Actual delivery needs a working email provider — Emergent email returns 422 off-platform, already flagged.)
- Razorpay refunds: returns.py refunded branch now routes online-paid orders (payment_method=online + razorpay_payment_id) to a real Razorpay refund via payments.refund_payment() (records method=razorpay + rfnd ref); COD/wallet orders still credit the wallet. Refund failures surface as HTTP 400 with a clear message (5xx bodies get masked by ingress).
- Checkout UX fixes from iteration_17: Razorpay prefill now sends {name, email(user.email), contact=10-digit}; added modal.ondismiss (cancel -> toast + go to order) and rz.on('payment.failed') handler.
- Tests: backend/tests/test_razorpay_flow.py, test_refund_routing.py (wallet path), test_online_refund_branch.py (online path) all pass.
- BACKLOG from iteration_17: auto-cancel/expire orphan unpaid online orders (each abandoned popup leaves a pending order); client-side min-order + PIN validation before pay; empty <img src=""> in cart/order thumbnails (LOW); combo 'Swap Test Combo' Rs.0 leftover line in cart.

## Iteration 26 (2026-06) — Production hardening (Twilio Verify, S3, CORS, SMTP)
- OTP: auth.py now uses Twilio Verify when TWILIO_ACCOUNT_SID+AUTH_TOKEN+VERIFY_SERVICE_SID set (verify_start/verify_check in notifications.py). dev_otp is returned ONLY when APP_ENV!=production AND SMS unconfigured -> never leaks in prod. Verify-mode verify-otp uses Twilio verification_checks. Set Twilio Account SID + Auth Token in backend/.env; TWILIO_VERIFY_SERVICE_SID still blank (needs VA SID).
- Object storage: uploads.py put_object/get_object route to S3 (boto3) when S3_BUCKET set; product images public-read, /returns/ photos private + serve_file now requires auth for /returns/ paths. Falls back to Emergent when S3 unset (existing files keep working). boto3 added to requirements.txt.
- CORS: server.py reads CORS_ORIGINS (comma list) else FRONTEND_URL; env-driven, no hardcoded domain. backend/.env CORS_ORIGINS emptied (was "*").
- Email: notifications.send_email uses SMTP when SMTP_HOST set, else Emergent fallback.
- HTTPS: secure/httponly/SameSite=None cookies unchanged (HTTPS mandatory, handled by nginx/TLS).
- deploy/.env.example + docker-compose.yml updated with APP_ENV, TWILIO_VERIFY_SERVICE_SID, S3_*, SMTP_*.
- Verified: CORS env-driven, dev_otp gating, Razorpay full flow + online-refund routing all pass. Readiness rescan = WARN (no hard blockers).
- STILL NEEDS CREDS: Twilio Verify Service SID (VA...); S3 bucket+keys(+endpoint for R2/Wasabi/Spaces); SMTP host/user/pass (or own Resend/SES). Google Play AAB: no android/ project, no eas.json, no package id yet.

## Iteration 27 (2026-06) — Production credentials configured
- Razorpay TEST keys updated (rzp_test_TRzm50mOrFMoK9). Full flow test PASS. COD preserved.
- Twilio Verify configured (Account SID + Auth Token + Verify Service SID VA6a15...). OTP uses Verify; dev_otp never returned (verify_mode). Live send blocked ONLY by Twilio TRIAL account (403: unverified recipient) — verify recipient numbers or upgrade account.
- Resend email via SMTP (smtp.resend.com:465, user=resend, key in env, from=onboarding@resend.dev). send_email SMTP path succeeds without error; set a verified domain sender for general delivery.
- Cloudflare R2: endpoint + access key id + bucket 'bestkart' recorded; S3_SECRET_ACCESS_KEY MISSING -> S3_BUCKET left empty so storage stays on working fallback (avoids broken uploads). Provide R2 secret to activate (code already supports via S3_* + endpoint).
- All secrets in git-ignored backend/.env only; none in source/frontend/logs/responses. No code changed this iteration (env-only).

## Iteration 28 (2026-06) — Cloudflare R2 activated & tested
- R2 Secret Access Key configured; S3_BUCKET=bestkart enabled. Object storage now uses R2 (boto3, S3-compatible endpoint) — Emergent storage dependency removed for new uploads.
- Tests PASS: product image upload -> R2 (url returned), retrieval GET 200 image/png 70B round-trip, refund/replacement photo upload -> R2 private (unauth GET 401, admin GET 200).
- All creds in git-ignored backend/.env only; nothing in source/logs/responses. No code changed (env-only).
- Remaining for full live prod: Twilio trial->upgrade or verify recipient numbers; Resend verified sender domain (currently onboarding@resend.dev sandbox).

## 2026-08-23 — Production Docker/VPS login fix (bestkart.in)
- ROOT CAUSE: (1) frontend/src/lib/api.js baked `${REACT_APP_BACKEND_URL}/api` -> literal "undefined/api" when build arg unset; (2) docker-compose delivered backend vars only via ${VAR} interpolation -> JWT_SECRET/auth vars empty when deploy/.env not picked up.
- FIX (minimal, no feature change): api.js now strips trailing slash and falls back to same-origin relative "/api"; deploy/docker-compose.yml backend now uses `env_file: - .env` (fails fast if missing, always delivers runtime vars); deploy/.env.example REACT_APP_BACKEND_URL blank recommended for single-domain (handles apex+www), CORS_ORIGINS includes www.
- VERIFIED: register/login/session 200 end-to-end; api base logic unset->/api, set->absolute; compose YAML valid.

## 2026-08-23 — Admin Notification Center + FCM-ready notifications
- Shared notification system (web + future Android): backend routers/notifications_center.py, core/fcm.py.
- Admin: compose (title/message/image/deep-link/type), target all/selected/segment(new,active,inactive,high_value,with_wallet), send-now or schedule; history with recipient/read/push counts + cancel scheduled.
- Customer: bell + unread badge + panel (NotificationBell.js), full /notifications page, mark-read/all.
- Device tokens: PUT/DELETE /api/me/device-tokens (multi-device). FCM push via firebase-admin, graceful no-op until FIREBASE_SERVICE_ACCOUNT_JSON set.
- Automatic notifications: order lifecycle (notify_order), payment success/failure (payments.py + notifications.py), refund/replacement (returns.py).
- Scheduling via .emergent/crons.yml (every 15m) -> POST /api/cron/dispatch-notifications (auth via WEBHOOK_CRON_SECRET).
- New env: FIREBASE_SERVICE_ACCOUNT_JSON, WEBHOOK_CRON_SECRET (backend/.env + deploy/.env.example + docker-compose env_file). requirements.txt frozen with firebase-admin 7.5.0.
- VERIFIED: backend 11/11 curl flows; frontend testing agent 12/12 (iteration_18.json). Test data cleaned.
- PENDING (user/account): supply Firebase service-account JSON to enable real Android push; Android app itself is still a scaffold (must be built to receive closed-app push).

## 2026-08-23 — ASAP replaced by "Get in 30 Minutes" (per-PIN express delivery)
- Removed global ASAP; express delivery is now per-PIN: PinCodeInput.express_enabled + express_charge (models.py, pincodes.py check returns them).
- Admin PIN dialog: "Get in 30 Minutes available" toggle + "30-minute delivery charge"; list shows Normal + 30-Min columns. AdminDelivery ASAP section removed (30-min is per-PIN).
- Checkout: express card shows only when PIN.express_enabled; adds express_charge; auto-falls back to slot if PIN lacks it. Order: delivery_type "express", express_charge, is_express + is_priority.
- Admin orders: "30-Min Delivery" badge + "30-Min" tag + charge row. Analytics express_revenue; PIN stats express_orders. Coupons delivery scope "express".
- Backward-compat: legacy orders/coupons with delivery_type/scope "asap" and asap_charge still render as "Get in 30 Minutes" and count in revenue.
- Migration run on existing pincodes (520003/520004 enabled Rs100, 520005 disabled); slots no longer expose asap.
- VERIFIED: backend API E2E (express order 699+40+100=839, disabled-PIN 400, analytics express_revenue, slots no asap); frontend testing agent iteration_19.json 10/11 then fixed remaining Home/Footer copy. Test data cleaned.
