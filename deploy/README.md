# Freshly / BestKart — Production Deployment Package

This folder contains everything needed to self-host the **website + admin panel + API**
on a **Hostinger VPS** (Ubuntu 24.04 LTS) or any Docker host. No application/business
logic was changed to create this package — these are additive deployment files only.

```
backend/Dockerfile          FastAPI + MongoDB app image (uvicorn on :8001)
frontend/Dockerfile         React build -> nginx static + /api reverse proxy
frontend/nginx.conf         SPA fallback + proxies /api to the backend
deploy/docker-compose.yml   Orchestrates mongo + backend + frontend
deploy/.env.example         All environment variables (copy to .env ON THE VPS)
deploy/nginx-https.conf     Optional host-level nginx for TLS (Certbot)
```

## Architecture (single domain)
```
Internet ──▶ frontend (nginx :80)
                 ├── /            -> React static build (store + admin SPA)
                 └── /api/...     -> backend (FastAPI :8001)  -> MongoDB
```
Because the site and API share one origin, there are **no CORS problems** and the
frontend simply calls `${REACT_APP_BACKEND_URL}/api/...`.

---

## 1. Prerequisites (on the VPS — Ubuntu 24.04 LTS)
```bash
curl -fsSL https://get.docker.com | sh
sudo apt-get install -y docker-compose-plugin git
```

## 2. Get the code onto the server (GitHub clone — recommended)
Use the **"Save to GitHub"** feature in the Emergent chat to push this project to a
**private** repository (the `.env` files are git-ignored, so no secrets are committed),
then on the VPS:
```bash
sudo mkdir -p /opt && cd /opt
git clone https://github.com/<your-username>/<your-repo>.git bestkart
cd bestkart
```
> Alternative: `scp`/SFTP the project (exclude `.env`, `node_modules`, and build
> artifacts). GitHub clone is preferred because updates are a simple `git pull`.

## 3. Configure environment (secrets live ONLY on the VPS)
```bash
cd /opt/bestkart/deploy
cp .env.example .env
nano .env               # fill in real values (see below)
openssl rand -hex 32    # use output for JWT_SECRET
```
Fill in `.env` with:
- **Domain**: `REACT_APP_BACKEND_URL`, `FRONTEND_URL`, `CORS_ORIGINS` = `https://bestkart.in`
- **JWT_SECRET** + first admin (`ADMIN_EMAIL`, `ADMIN_PASSWORD`)
- **Cloudflare R2** (active object storage): `S3_BUCKET=bestkart`, `S3_REGION=auto`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT_URL`
- **Resend SMTP** (active email): `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=587`,
  `SMTP_USERNAME=resend`, `SMTP_PASSWORD=<Resend API key>`,
  `SMTP_FROM_EMAIL=noreply@bestkart.in` (domain must be **verified in Resend**)
- **Twilio Verify** (OTP): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`
- **Razorpay** (TEST mode for now): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- **Database**: keep the bundled `mongo` container, **or** point `MONGO_URL` to
  MongoDB Atlas and remove the `mongo` service from `docker-compose.yml`.

## 4. Build & run
```bash
cd /opt/bestkart/deploy
docker compose up -d --build
docker compose ps
docker compose logs -f backend      # watch startup (seeds admin + indexes)
```
The site comes up on `http://<server-ip>/`. Admin is at `/admin/login`
(use `ADMIN_EMAIL` / `ADMIN_PASSWORD`).

## 5. Point your domain
DNS is already configured: `bestkart.in` → `187.52.122.30` (A record) and
`www` → `bestkart.in` (CNAME).

## 6. Enable HTTPS (mandatory)
The app sets `secure` / `SameSite=None` auth cookies, and browser geolocation
requires HTTPS, so **HTTPS is required** in production. Options:
- **Cloudflare** (proxy on, Full/Strict TLS) — zero server config, or
- **Certbot + host nginx**: use `deploy/nginx-https.conf` as a template:
  1. Change compose `frontend` to publish `127.0.0.1:8080:80` instead of `80:80`.
  2. Install nginx + certbot on the host, drop in `nginx-https.conf`, run
     `sudo certbot --nginx -d bestkart.in -d www.bestkart.in`.
- **Traefik/Caddy** in front also work well.

## 7. Configure the Razorpay webhook
After HTTPS is live, set the Razorpay webhook URL to
`https://bestkart.in/api/payments/webhook` and paste its secret into
`RAZORPAY_WEBHOOK_SECRET`.

## 8. Updating later
```bash
cd /opt/bestkart && git pull
cd deploy && docker compose up -d --build   # rebuild bakes any new URL
```

---

## Integration status (already wired in code)
- **Object storage — Cloudflare R2 (ACTIVE).** `backend/routers/uploads.py` uses the
  S3-compatible client (`boto3`). Product images are public-read; refund/replacement
  photos are private and served only via the authenticated `/api/files` proxy.
  Configure the `S3_*` vars. (Legacy Emergent-stored objects still resolve through a
  fallback; no bulk migration is performed.)
- **Email — Resend over SMTP (ACTIVE).** `backend/routers/notifications.py` sends via
  SMTP when `SMTP_HOST` is set (order/payment/refund/replacement notifications).
  Verify your sending domain in Resend and use a `noreply@bestkart.in` From address.
- **Payments — Razorpay (TEST mode).** Reads standard keys from `.env`. Switch to LIVE
  keys only when you're ready; leave blank for COD-only.
- **SMS OTP — Twilio Verify.** Reads `TWILIO_*` from `.env`. Trial accounts can only
  send to verified numbers; upgrade/add billing to reach any customer number. In
  `APP_ENV=production` the API never returns a dev OTP.

## Android app note
The Android WebView/TWA app (once built) should send `X-Client-Platform: app`
(or open the site with `?platform=app`) so orders/usage are attributed to **App**
in the "Website vs App" analytics. Normal browsers are counted as **Website**.

## Health checks
- Backend: `GET https://bestkart.in/api/`  → `{"status":"ok"}`
- Frontend: `GET https://bestkart.in/`      → the store loads
