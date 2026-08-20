# Freshly Grocery — Production Deployment Package

This folder contains everything needed to self-host the **website + admin panel + API**
on a **Hostinger VPS** (or any Docker host). Nothing in the application code was changed
to create this package — these are additive deployment files only.

```
backend/Dockerfile          FastAPI + MongoDB app image (uvicorn on :8001)
frontend/Dockerfile         React build -> nginx static + /api reverse proxy
frontend/nginx.conf         SPA fallback + proxies /api to the backend
deploy/docker-compose.yml   Orchestrates mongo + backend + frontend
deploy/.env.example         All environment variables (copy to .env)
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

## 1. Prerequisites (on the VPS)
```bash
# Ubuntu 22.04+ Hostinger VPS
curl -fsSL https://get.docker.com | sh
sudo apt-get install -y docker-compose-plugin
```

## 2. Get the code onto the server
Upload the whole project (backend/, frontend/, deploy/) to the VPS, e.g.
`/opt/freshly`. Use the "Save to GitHub" feature in the Emergent chat, then
`git clone` on the server (recommended), or `scp`/SFTP.

## 3. Configure environment
```bash
cd /opt/freshly/deploy
cp .env.example .env
nano .env          # set domain, JWT_SECRET, admin creds, DB, keys
openssl rand -hex 32   # use this for JWT_SECRET
```
- **Single domain**: set `REACT_APP_BACKEND_URL`, `FRONTEND_URL`, `CORS_ORIGINS`
  all to `https://your-domain.com`.
- **Database**: keep the bundled `mongo` container, **or** point `MONGO_URL` to
  MongoDB Atlas and delete the `mongo` service from `docker-compose.yml`.

## 4. Build & run
```bash
cd /opt/freshly/deploy
docker compose up -d --build
docker compose ps
docker compose logs -f backend      # watch startup (seeds admin + indexes)
```
The site is now on `http://your-server-ip/`. The admin is at `/admin/login`
(use `ADMIN_EMAIL` / `ADMIN_PASSWORD`).

## 5. Point your domain
In Hostinger DNS, add an **A record** for `your-domain.com` → your VPS IP.

## 6. Enable HTTPS (required for GPS/geolocation & secure cookies)
The app sets `secure`/`SameSite=None` auth cookies, so **HTTPS is mandatory** in
production. Easiest options:
- **Cloudflare** (proxy on, Full/Flexible TLS) — zero server config, or
- **Certbot + host nginx**: use `deploy/nginx-https.conf` (below) as a template:
  1. Change compose `frontend` to publish `127.0.0.1:8080:80` instead of `80:80`.
  2. Install nginx + certbot on the host, drop in `nginx-https.conf`, run
     `sudo certbot --nginx -d your-domain.com`.
- **Traefik/Caddy** in front also work well.

## 7. Updating later
```bash
git pull
docker compose up -d --build     # rebuild (frontend rebuild bakes new URL)
```

---

## ⚠️ Self-hosting caveats (read before going fully live)
These features use **Emergent-managed integrations** and may not work off the
Emergent platform without replacement:
- **Object storage** (product images, refund/replacement photo uploads) — code in
  `backend/routers/uploads.py` calls the Emergent object-storage proxy using
  `EMERGENT_LLM_KEY`. Off-platform you'll want to swap this for S3/GCS.
- **Email** (`EMERGENT_EMAIL_KEY`, Resend via Emergent) — swap for your own
  Resend/SES/SMTP credentials if it doesn't send off-platform.
- **LLM features** (`EMERGENT_LLM_KEY`) — replace with your own OpenAI/Gemini/
  Anthropic key if used.
- **Payments (Razorpay)** and **SMS (Twilio)** already read standard keys from
  `.env` — leave blank to run in COD-only / OTP-dev mode, or add real keys.

## Android app note
The Android WebView/TWA app (once built) should send `X-Client-Platform: app`
(or open the site with `?platform=app`) so orders/usage are attributed to **App**
in the "Website vs App" analytics. Normal browsers are counted as **Website**.

## Health checks
- Backend: `GET https://your-domain.com/api/`  → `{"status":"ok"}`
- Frontend: `GET https://your-domain.com/`      → the store loads
