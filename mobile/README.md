# BestKart — Android App (Expo / React Native)

A native Android customer app that reuses the **exact same production backend, APIs,
authentication, catalog, cart, checkout, delivery rules and notifications** as the
BestKart website. No separate backend or database.

## What's implemented
- Email/password **register + login** with persistent auth (Bearer JWT stored in Expo SecureStore, auto token-refresh on 401).
- **Home** with PIN-code serviceability check + per-PIN delivery charges + Get-in-30 availability, categories, featured products.
- **Shop** with search + category filters, **product details**.
- **Cart** (add / update qty / remove, per-PIN min-order guard) and **Checkout**:
  - Delivery address selection + add address.
  - **Normal scheduled slot** delivery and admin-controlled **Get in 30 Minutes** (only shown when the PIN enables it, with its charge).
  - Coupons, **COD** and **Razorpay** online payment (Razorpay Checkout in a WebView → verified via the same `/payments/razorpay/verify` endpoint).
- **Order history** + order detail (30-Min badge, charges, status).
- **Account** (profile, mobile verified badge, wallet balance, address management), **Offers**, **Notifications** center.
- **FCM push**: on login the device registers its **real native FCM token** (`getDevicePushTokenAsync`) to `PUT /api/me/device-tokens`. Push taps open **deep links** (`/orders/:id`, `/product/:id`, `/offers`, …).
- Loading / empty / error / offline states throughout.

## Configure the backend URL
The app points to production via `app.json → expo.extra.apiUrl` (default `https://bestkart.in`).
Override at build time with `EXPO_PUBLIC_BACKEND_URL`. It calls `${apiUrl}/api/...` — identical to the web.

## One-time setup (on your machine)
```bash
cd mobile
npm install -g eas-cli
yarn install
eas login                       # your Expo account
eas init                        # creates the EAS project; put the printed projectId into app.json extra.eas.projectId
```

## Firebase / FCM (required for push)
1. Firebase Console → Project **bestkart-d4cbf** → Add app → **Android**, package name **`in.bestkart.app`**.
2. Download **`google-services.json`** and place it at `mobile/google-services.json` (already referenced in `app.json`).
   - This is the CLIENT config (safe to embed). The backend already has the service-account key.
3. FCM push only works in a real **dev/production build** (not Expo Go).

## Run / test
```bash
# Development build on a real Android device (needed for FCM tokens):
eas build --profile development --platform android
# install the APK on your phone, then:
npx expo start --dev-client
```
- Log in → the app requests notification permission and registers the FCM token.
- **End-to-end push test:** Admin panel → Notifications → send to "All customers" (or the test account).
  Backend → Firebase → your device shows the notification even when the app is closed; tapping opens the deep-linked screen.

## Build a signed AAB for Google Play
```bash
eas build --profile production --platform android    # produces an .aab; EAS manages the signing keystore
eas submit --profile production --platform android    # optional: upload to Play Console
```
`versionCode` auto-increments (see `eas.json`). App id: `in.bestkart.app`.

## Notes
- Payments run in Razorpay **TEST** mode until live keys are set on the backend.
- The app never stores secrets; only the short-lived access token + refresh token in SecureStore.
