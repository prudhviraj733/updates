import hashlib
import os
import random
import re
from datetime import datetime, timezone, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from core.db import db
from core.security import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    set_auth_cookies, get_current_user, get_jwt_secret, JWT_ALGORITHM,
)
from models import RegisterInput, LoginInput, ProfileUpdate, PhoneOtpSendInput, PhoneOtpVerifyInput
import jwt

router = APIRouter()

APP_ENV = os.environ.get("APP_ENV", "development").lower()
MAX_ATTEMPTS = 5
LOCK_MINUTES = 15

# ---------------- Phone / OTP config ----------------
OTP_TTL_MINUTES = 5
OTP_RESEND_COOLDOWN_SECONDS = 30
OTP_MAX_SENDS_PER_HOUR = 5
OTP_MAX_VERIFY_ATTEMPTS = 5


def normalize_indian_phone(raw: str) -> str:
    """Validate an Indian mobile number and return it as +91XXXXXXXXXX.

    Rules: exactly 10 national digits starting 6/7/8/9. Optional +91/91/0
    prefixes are stripped. Raises HTTPException(400) on any invalid input.
    """
    if not raw or not isinstance(raw, str):
        raise HTTPException(status_code=400, detail="Enter a valid mobile number")
    s = raw.strip().replace(" ", "").replace("-", "")
    if not re.fullmatch(r"\+?\d+", s):
        raise HTTPException(status_code=400, detail="Mobile number can only contain digits")
    digits = re.sub(r"\D", "", s)
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if len(digits) != 10:
        raise HTTPException(status_code=400, detail="Mobile number must be exactly 10 digits")
    if digits[0] not in "6789":
        raise HTTPException(status_code=400, detail="Enter a valid Indian mobile number")
    return "+91" + digits


def _twilio_configured() -> bool:
    return bool(os.environ.get("TWILIO_ACCOUNT_SID") and os.environ.get("TWILIO_AUTH_TOKEN")
                and os.environ.get("TWILIO_FROM_NUMBER"))


def _hash_otp(otp: str) -> str:
    return hashlib.sha256((os.environ["JWT_SECRET"] + otp).encode("utf-8")).hexdigest()


@router.post("/auth/register")
async def register(payload: RegisterInput, request: Request, response: Response):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    from core.platform import client_platform
    doc = {
        "name": payload.name,
        "email": email,
        "phone": payload.phone,
        "password_hash": hash_password(payload.password),
        "role": "customer",
        "wishlist": [],
        "signup_platform": client_platform(request),
        "last_platform": client_platform(request),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    access = create_access_token(uid, email, "customer")
    refresh_tok = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh_tok)
    return {"id": uid, "name": payload.name, "email": email, "phone": payload.phone,
            "phone_verified": False, "role": "customer",
            "token": access, "refresh_token": refresh_tok}


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else "unknown"


@router.post("/auth/login")
async def login(payload: LoginInput, request: Request, response: Response):
    email = payload.email.lower().strip()
    ip = _client_ip(request)
    now = datetime.now(timezone.utc)
    # Lock primarily per-account (email) so the control works even when the
    # client IP is masked/rotated by the ingress proxy; IP is kept for logging.
    identifier = f"acct:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    # Rolling window: forget stale failures so occasional typos never permanently
    # lock out a legitimate user.
    if attempt:
        last = attempt.get("last_attempt_at")
        if last and (now - datetime.fromisoformat(last)) > timedelta(minutes=LOCK_MINUTES):
            await db.login_attempts.delete_one({"identifier": identifier})
            attempt = None
    if attempt and attempt.get("count", 0) >= MAX_ATTEMPTS:
        locked_until = attempt.get("locked_until")
        if locked_until and datetime.fromisoformat(locked_until) > now:
            mins = max(1, int((datetime.fromisoformat(locked_until) - now).total_seconds() // 60) + 1)
            raise HTTPException(status_code=429,
                                detail=f"Too many failed attempts. Please try again in {mins} minute(s).")

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        count = (attempt.get("count", 0) if attempt else 0) + 1
        update = {"count": count, "last_attempt_at": now.isoformat()}
        if count >= MAX_ATTEMPTS:
            update["locked_until"] = (now + timedelta(minutes=LOCK_MINUTES)).isoformat()
        await db.login_attempts.update_one({"identifier": identifier}, {"$set": update}, upsert=True)
        if count >= MAX_ATTEMPTS:
            raise HTTPException(status_code=429,
                                detail=f"Too many failed attempts. Please try again in {LOCK_MINUTES} minutes.")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await db.login_attempts.delete_one({"identifier": identifier})
    uid = str(user["_id"])
    from core.platform import record_ping
    platform = await record_ping(request, uid)
    await db.users.update_one({"_id": user["_id"]},
                              {"$set": {"last_platform": platform,
                                        "last_active_at": datetime.now(timezone.utc).isoformat()}})
    set_auth_cookies(response, create_access_token(uid, email, user["role"]),
                     create_refresh_token(uid))
    access = create_access_token(uid, email, user["role"])
    refresh_tok = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh_tok)
    return {"id": uid, "name": user["name"], "email": email,
            "phone": user.get("phone"), "phone_verified": user.get("phone_verified", False),
            "role": user["role"], "token": access, "refresh_token": refresh_tok}


@router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        try:
            body = await request.json()
            token = (body or {}).get("refresh_token")
        except Exception:
            token = None
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access = create_access_token(str(user["_id"]), user["email"], user["role"])
        response.set_cookie("access_token", access, httponly=True, secure=True,
                            samesite="none", max_age=86400, path="/")
        return {"message": "refreshed", "token": access}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.put("/auth/profile")
async def update_profile(payload: ProfileUpdate, user: dict = Depends(get_current_user)):
    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name
    # Phone can NOT be changed here — it must go through OTP verification.
    if payload.phone is not None:
        current = user.get("phone")
        try:
            incoming = normalize_indian_phone(payload.phone)
        except HTTPException:
            incoming = None
        if not (incoming and incoming == current and user.get("phone_verified")):
            raise HTTPException(
                status_code=403,
                detail="Mobile number changes require OTP verification. Use verify mobile number.",
            )
    if updates:
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": updates})
    updated = await db.users.find_one({"_id": ObjectId(user["id"])})
    return {"id": user["id"], "name": updated["name"], "email": updated["email"],
            "phone": updated.get("phone"), "phone_verified": updated.get("phone_verified", False),
            "role": updated["role"]}


@router.post("/auth/phone/send-otp")
async def send_phone_otp(payload: PhoneOtpSendInput, user: dict = Depends(get_current_user)):
    phone = normalize_indian_phone(payload.phone)
    # Same number already verified → no OTP needed.
    if phone == user.get("phone") and user.get("phone_verified"):
        return {"status": "already_verified",
                "message": "This mobile number is already verified."}

    now = datetime.now(timezone.utc)
    existing = await db.phone_otps.find_one({"user_id": user["id"]})
    if existing:
        last_sent = existing.get("last_sent_at")
        if last_sent:
            elapsed = (now - datetime.fromisoformat(last_sent)).total_seconds()
            if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
                raise HTTPException(status_code=429,
                                    detail=f"Please wait {int(OTP_RESEND_COOLDOWN_SECONDS - elapsed)}s before requesting another code.")
        window_start = existing.get("window_start")
        send_count = existing.get("send_count", 0)
        if window_start and (now - datetime.fromisoformat(window_start)).total_seconds() < 3600:
            if send_count >= OTP_MAX_SENDS_PER_HOUR:
                raise HTTPException(status_code=429,
                                    detail="Too many OTP requests. Please try again later.")
        else:
            send_count = 0
            window_start = now.isoformat()
    else:
        send_count = 0
        window_start = now.isoformat()

    otp = f"{random.randint(0, 999999):06d}"
    from routers.notifications import send_sms, twilio_verify_enabled, verify_start
    verify_mode = twilio_verify_enabled()
    await db.phone_otps.update_one(
        {"user_id": user["id"]},
        {"$set": {
            "user_id": user["id"], "phone": phone,
            "otp_hash": None if verify_mode else _hash_otp(otp),
            "mode": "verify" if verify_mode else "local",
            "expires_at": (now + timedelta(minutes=OTP_TTL_MINUTES)).isoformat(),
            "attempts": 0, "last_sent_at": now.isoformat(),
            "send_count": send_count + 1, "window_start": window_start,
        }},
        upsert=True,
    )

    if verify_mode:
        # Twilio Verify sends & stores the code server-side (production).
        try:
            await verify_start(phone)
        except Exception:
            await db.phone_otps.delete_one({"user_id": user["id"]})
            raise HTTPException(status_code=503, detail="OTP service is temporarily unavailable. Please try again.")
        return {"status": "sent", "phone": phone, "expires_in": OTP_TTL_MINUTES * 60,
                "message": f"An OTP has been sent to {phone}."}

    try:
        await send_sms(phone, f"Your SavingSmart verification code is {otp}. Valid for {OTP_TTL_MINUTES} minutes.")
    except Exception:
        pass

    resp = {"status": "sent", "phone": phone,
            "expires_in": OTP_TTL_MINUTES * 60,
            "message": f"An OTP has been sent to {phone}."}
    # Dev-only fallback: expose the code ONLY when NOT production AND SMS not configured.
    if not _twilio_configured() and APP_ENV != "production":
        resp["dev_otp"] = otp
        resp["message"] = f"SMS is not configured (dev). Dev OTP for {phone}: {otp}"
    return resp


@router.post("/auth/phone/verify-otp")
async def verify_phone_otp(payload: PhoneOtpVerifyInput, user: dict = Depends(get_current_user)):
    phone = normalize_indian_phone(payload.phone)
    otp = (payload.otp or "").strip()
    if not re.fullmatch(r"\d{6}", otp):
        raise HTTPException(status_code=400, detail="Enter the 6-digit code")

    rec = await db.phone_otps.find_one({"user_id": user["id"]})
    if not rec or rec.get("phone") != phone:
        raise HTTPException(status_code=400, detail="No OTP request found. Please request a new code.")
    if datetime.fromisoformat(rec["expires_at"]) <= datetime.now(timezone.utc):
        await db.phone_otps.delete_one({"user_id": user["id"]})
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new code.")
    if rec.get("attempts", 0) >= OTP_MAX_VERIFY_ATTEMPTS:
        await db.phone_otps.delete_one({"user_id": user["id"]})
        raise HTTPException(status_code=429, detail="Too many incorrect attempts. Please request a new code.")

    if rec.get("mode") == "verify":
        from routers.notifications import verify_check
        try:
            ok = await verify_check(phone, otp)
        except Exception:
            raise HTTPException(status_code=503, detail="OTP service is temporarily unavailable. Please try again.")
        if not ok:
            await db.phone_otps.update_one({"user_id": user["id"]}, {"$inc": {"attempts": 1}})
            raise HTTPException(status_code=400, detail="Incorrect OTP. Please try again.")
    elif _hash_otp(otp) != rec.get("otp_hash"):
        await db.phone_otps.update_one({"user_id": user["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Incorrect OTP. Please try again.")

    await db.users.update_one({"_id": ObjectId(user["id"])},
                              {"$set": {"phone": phone, "phone_verified": True}})
    await db.phone_otps.delete_one({"user_id": user["id"]})
    updated = await db.users.find_one({"_id": ObjectId(user["id"])})
    return {"id": user["id"], "name": updated["name"], "email": updated["email"],
            "phone": updated.get("phone"), "phone_verified": True, "role": updated["role"],
            "message": "Mobile number verified successfully."}
