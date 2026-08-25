# SavingSmart — Project Handoff & Remaining-Work Checklist

_Last updated: 2026-06 • For the incoming developer/freelancer_

SavingSmart is a **PIN-code-based online grocery platform**: a customer storefront + admin
panel (web) and a customer **Android app**, sharing one FastAPI + MongoDB backend.

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11, **FastAPI**, Motor (async MongoDB driver), Pydantic v2, Uvicorn |
| **Database** | **MongoDB** (cloud/self-hosted; persistent Docker volume in the deploy package) |
| **Web frontend** | **React 18** (Create React App / CRACO), Tailwind CSS, shadcn/ui, react-router-dom, axios, react-helmet-async (SEO), Framer Motion, Leaflet (map picker) |
| **Mobile app** | **React Native via Expo (SDK 51)**, React Navigation, axios, Expo SecureStore, expo-notifications (FCM), react-native-webview (Razorpay) |
| **Auth** | JWT (HttpOnly Secure cookies for web; Bearer token for mobile), bcrypt password hashing |
| **Payments** | **Razorpay** (orders, HMAC verify, webhook, refunds) — currently TEST mode |
| **SMS OTP** | **Twilio Verify** |
| **Email** | **Resend** over SMTP (order/payment/refund/admin notifications) |
| **Object storage** | **Cloudflare R2** (S3-compatible; product images public, refund photos private) |
| **Push** | **Firebase Cloud Messaging (FCM)** via `firebase-admin` |
| **Scheduling** | Platform cron → `POST /api/cron/dispatch-notifications` (scheduled notifications) |
| **Deploy** | Docker + docker-compose + Nginx (single-domain), target: Hostinger Ubuntu 24.04 VPS |

---

## 2. Repository Layout
```
/backend      FastAPI app
  server.py           app + router registration + startup (indexes, seed, FCM init)
  models.py           Pydantic models
  core/               db.py, security.py (JWT/bcrypt), fcm.py, platform.py
  routers/            auth, products, categories, brands, pincodes, inventory, carts,
                      delivery, coupons, packages, orders, payments, analytics, wallet,
                      referral, customers, returns, uploads, usage, notifications_center, seo
  seed.py             idempotent seed (admin + demo data)
  Dockerfile, requirements.txt
/frontend     React web (storefront + /admin panel)
  src/pages/store/*   customer pages
  src/pages/admin/*   admin pages
  src/components/, src/context/, src/lib/
  Dockerfile, nginx.conf
/mobile       Expo React Native Android app  (see mobile/README.md)
/deploy       docker-compose.yml, .env.example, nginx-https.conf, README.md
/memory       PRD.md, CHANGELOG-style notes, test_credentials.md
```

---

## 3. Environment Variables (set in `deploy/.env` on the VPS — never commit)
`MONGO_URL`, `DB_NAME`, `APP_ENV=production`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`FRONTEND_URL`, `CORS_ORIGINS`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`,
`FIREBASE_SERVICE_ACCOUNT_JSON`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`,
`SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `WEBHOOK_CRON_SECRET`.
Frontend `REACT_APP_BACKEND_URL` — leave blank for same-origin `/api` on single domain.

---

## 4. Integration Status

| Integration | Status | Action needed to go fully live |
|---|---|---|
| MongoDB | ✅ Done | Point `MONGO_URL` to production Mongo; ensure backups |
| Razorpay | ✅ Working (**TEST**) | Swap to `rzp_live_…` keys + set live webhook `https://<domain>/api/payments/webhook` |
| Cloudflare R2 | ✅ Live | none (validate from VPS after deploy) |
| Resend (email) | ⚙️ Configured | **Verify sending domain** in Resend; set `SMTP_FROM_EMAIL=noreply@bestkart.in` |
| Twilio Verify (OTP) | ⏳ Blocked at account | **Approve Trust Hub Primary Customer Profile**; then OTP delivers to +91 |
| Firebase FCM (backend) | ✅ Live | none |
| Firebase FCM (Android client) | ⏳ Pending | Add Android app `in.bestkart.app` in Firebase → download `google-services.json` into `mobile/` |
| SEO | ✅ Done | none |

---

## 5. What's DONE
- Full customer storefront: catalog, categories, search/filters, product pages, cart, checkout, orders, addresses, wallet, referrals, offers/coupons, PIN serviceability, GPS/map delivery pin.
- Full admin panel: dashboard, orders (+status workflow), inventory (PIN-scoped stock), PIN codes, coupons, customers, delivery, analytics, packages/combos, **Refunds/Replacements**, **Notification Center**, Website-vs-App usage analytics.
- **Get in 30 Minutes** express delivery — admin-controlled per PIN (with per-PIN normal + express charges); ASAP fully removed.
- **Notifications:** admin compose (all/segment/selected, send-now/scheduled) + customer in-app center + FCM push wiring + deep links + auto order/payment/refund notifications.
- **SEO:** meta/OG/JSON-LD + robots.txt + sitemap.xml.
- **Auth hardening:** rolling-window login lockout; mobile Bearer tokens.
- **Android app** (Expo): all core flows + FCM device-token registration + Razorpay via WebView.
- **Production deploy package** (Docker + Nginx) for Hostinger.

---

## 6. REMAINING WORK — Checklist

### 🔴 P0 — Required to go live (mostly account/config, little/no code)
- [ ] **Deploy to Hostinger VPS**: push repo to private GitHub → clone on VPS → fill `deploy/.env` → `docker compose up -d --build`. (See `deploy/README.md`.)
- [ ] **HTTPS**: point `bestkart.in` (already A→VPS) + enable TLS (Cloudflare or Certbot with `deploy/nginx-https.conf`). Cookies are Secure/SameSite=None → HTTPS is mandatory.
- [ ] **Twilio Trust Hub**: submit & get an **approved Primary Customer Profile** so OTP delivers to +91.
- [ ] **Resend domain**: verify `bestkart.in` and set `SMTP_FROM_EMAIL=noreply@bestkart.in`; confirm a real inbox delivery.
- [ ] **Razorpay live** (when ready): set `rzp_live_…` keys + live webhook + `RAZORPAY_WEBHOOK_SECRET`.

### 🟠 P1 — Mobile app to Play Store
- [ ] Add `google-services.json` (Firebase Android app `in.bestkart.app`) into `mobile/`.
- [ ] `eas init` → set `projectId` in `app.json`; add app icon + splash assets.
- [ ] `eas build -p android --profile development` → install on a real device → verify login, cart, checkout (COD + Razorpay), and **end-to-end push** (Admin → Firebase → device, incl. app-closed + deep link).
- [ ] `eas build -p android --profile production` → signed **AAB** → upload to Play Console (store listing, privacy policy, content rating).
- [ ] **Mobile phone-OTP at signup** (backend endpoints `/auth/phone/send-otp` & `/auth/phone/verify-otp` exist for logged-in users; needs an unauthenticated variant for registration). ⚠️ Keep OTP **optional** until Twilio Trust Hub is approved, otherwise it blocks all signups.

### 🟡 P2 — Nice-to-have / polish
- [ ] iOS build (Expo already supports it; add `google-services`→ APNs/Firebase iOS config).
- [ ] Cart drawer (web) shows a placeholder delivery charge before PIN is set — show "calculated at checkout".
- [ ] Brand consistency: some UI strings say "SavingSmart" vs "SavingSmart".
- [ ] Migrate any legacy Emergent-stored images to R2 (compat fallback currently serves them).
- [ ] Reorder button on past orders; product reviews/ratings; wishlist parity in app.
- [ ] Automated test suite (pytest for backend already partially present under `/backend/tests`).

---

## 7. Run locally (dev)
```bash
# Backend
cd backend && pip install -r requirements.txt
# set backend/.env (MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, integrations)
uvicorn server:app --host 0.0.0.0 --port 8001

# Web
cd frontend && yarn install && yarn start   # uses REACT_APP_BACKEND_URL

# Mobile
cd mobile && yarn install && npx expo start   # see mobile/README.md for FCM/EAS
```

## 8. Access the freelancer will need
- GitHub repo (private), Hostinger VPS SSH, domain/DNS (Cloudflare) access.
- Accounts: Razorpay, Twilio, Resend, Cloudflare R2, Firebase, MongoDB.
- Admin login for the app (in `/memory/test_credentials.md`).

_API base convention: every backend route is under `/api`; frontend/app call `${BACKEND_URL}/api/...`. Single-domain Nginx proxies `/api` → backend and serves the web build for everything else._
