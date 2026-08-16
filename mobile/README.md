# Freshly Grocery — Customer Mobile App (React Native / Expo)

This is the **customer mobile application scaffold**. It uses the **same backend and database**
as the responsive website and the admin dashboard — no separate database.

> This environment previews web apps only, so the React Native app is provided as a runnable
> scaffold you build/run locally with Expo. It talks to the exact same FastAPI backend.

## Architecture

- Same REST API as the web app (`/api/...`)
- JWT auth (mobile stores the token via `AsyncStorage` and sends `Authorization: Bearer <token>`;
  the backend already supports the Bearer header fallback in `get_current_user`).
- Shared domain: locations, categories, products, cart, delivery slots, ASAP delivery, orders.

## Screens (foldered under `src/screens`)

- `LoginScreen` — sign in / register
- `LocationScreen` — choose service location
- `HomeScreen` — categories + featured products
- `CategoryScreen` / product listing + search
- `ProductScreen` — product details
- `CartScreen`
- `CheckoutScreen` — address, delivery slots + ASAP, payment method
- `OrdersScreen`
- `ProfileScreen`

## Getting started (locally)

```bash
cd mobile
npm install
# set your backend URL
export EXPO_PUBLIC_BACKEND_URL="https://grocery-hub-1077.preview.emergentagent.com"
npx expo start
```

## Files

- `app.json` — Expo config
- `package.json` — dependencies
- `src/api/client.js` — shared axios client + token handling
- `src/context/AuthContext.js`, `src/context/StoreContext.js`
- `App.js` — navigation container

The API contract is identical to the web app, so any endpoint used here is already implemented
and tested in the backend.
