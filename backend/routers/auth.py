from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from core.db import db
from core.security import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    set_auth_cookies, get_current_user, get_jwt_secret, JWT_ALGORITHM,
)
from models import RegisterInput, LoginInput, ProfileUpdate
import jwt

router = APIRouter()

MAX_ATTEMPTS = 5
LOCK_MINUTES = 15


@router.post("/auth/register")
async def register(payload: RegisterInput, response: Response):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "name": payload.name,
        "email": email,
        "phone": payload.phone,
        "password_hash": hash_password(payload.password),
        "role": "customer",
        "wishlist": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    set_auth_cookies(response, create_access_token(uid, email, "customer"),
                     create_refresh_token(uid))
    return {"id": uid, "name": payload.name, "email": email, "phone": payload.phone, "role": "customer"}


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
    # Lock primarily per-account (email) so the control works even when the
    # client IP is masked/rotated by the ingress proxy; IP is kept for logging.
    identifier = f"acct:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= MAX_ATTEMPTS:
        locked_until = attempt.get("locked_until")
        if locked_until and datetime.fromisoformat(locked_until) > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        from datetime import timedelta
        count = (attempt.get("count", 0) if attempt else 0) + 1
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$set": {"count": count,
                      "locked_until": (datetime.now(timezone.utc) + timedelta(minutes=LOCK_MINUTES)).isoformat()}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await db.login_attempts.delete_one({"identifier": identifier})
    uid = str(user["_id"])
    set_auth_cookies(response, create_access_token(uid, email, user["role"]),
                     create_refresh_token(uid))
    return {"id": uid, "name": user["name"], "email": email,
            "phone": user.get("phone"), "role": user["role"]}


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
        return {"message": "refreshed"}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.put("/auth/profile")
async def update_profile(payload: ProfileUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": updates})
    updated = await db.users.find_one({"_id": ObjectId(user["id"])})
    return {"id": user["id"], "name": updated["name"], "email": updated["email"],
            "phone": updated.get("phone"), "role": updated["role"]}
