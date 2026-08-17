import os
import re
import ipaddress
import logging
import asyncio
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from bson import ObjectId

from core.db import db

logger = logging.getLogger(__name__)

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Freshly")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "").rstrip("/")

# ---------------- Email safety gate (from playbook, do not weaken) ----------------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened/numeric/credential URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> None:
    if not EMAIL_KEY or not to:
        return
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                     headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
    except Exception as e:
        logger.error(f"Email send failed: {e}")


def _send_sms_sync(to: str, body: str) -> None:
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    sender = os.environ.get("TWILIO_FROM_NUMBER")
    if not (sid and token and sender and to):
        return
    try:
        from twilio.rest import Client
        Client(sid, token).messages.create(body=body, from_=sender, to=to)
    except Exception as e:
        logger.error(f"SMS send failed: {e}")


async def send_sms(to: str, body: str) -> None:
    await asyncio.to_thread(_send_sms_sync, to, body)


STATUS_MESSAGES = {
    "pending": ("Order received", "We've received your order and will confirm it shortly."),
    "confirmed": ("Order confirmed", "Your order is confirmed and will be prepared soon."),
    "preparing": ("Order being prepared", "Our team is packing your groceries."),
    "ready_for_delivery": ("Order ready", "Your order is packed and ready for delivery."),
    "out_for_delivery": ("Out for delivery", "Your order is on the way!"),
    "delivered": ("Delivered", "Your order has been delivered. Enjoy!"),
    "cancelled": ("Order cancelled", "Your order has been cancelled. Any payment will be refunded if applicable."),
}


async def notify_order(order: dict, status: str) -> None:
    title, line = STATUS_MESSAGES.get(status, ("Order update", f"Your order status is now {status}."))
    order_no = order.get("order_number", "")
    name = order.get("customer_name", "there")
    phone = order.get("customer_phone", "")

    # SMS
    sms = f"{EMAIL_FROM_NAME}: Order {order_no} - {title}. {line}"
    try:
        await send_sms(phone, sms)
    except Exception as e:
        logger.error(f"notify sms error: {e}")

    # Email (fetch user email server-side)
    email = None
    try:
        user = await db.users.find_one({"_id": ObjectId(order["user_id"])}, {"email": 1})
        email = user.get("email") if user else None
    except Exception:
        email = None
    if not email:
        return

    track_link = f"{FRONTEND_URL}/orders" if FRONTEND_URL.startswith("https://") else None
    link_html = (f'<p style="margin:16px 0"><a href="{track_link}" '
                 f'style="background:#1B4332;color:#fff;padding:10px 18px;border-radius:999px;'
                 f'text-decoration:none">Track your order</a></p>') if track_link else ""
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;'
        f'font-family:Arial,sans-serif;color:#111">'
        f'<h2 style="color:#1B4332;margin:0 0 8px">{escape(title)}</h2>'
        f'<p>Hi {escape(name)},</p>'
        f'<p>{escape(line)}</p>'
        f'<p>Order <strong>{escape(order_no)}</strong> &middot; Total &#8377;{order.get("final_amount", 0)}</p>'
        f'{link_html}'
        f'<p style="font-size:12px;color:#888;margin-top:24px">Sent by {escape(EMAIL_FROM_NAME)}. '
        f'We never ask for your password or card details by email.</p>'
        f'</td></tr></table>'
    )
    try:
        await send_email(to=email, subject=f"{EMAIL_FROM_NAME}: {title} ({order_no})", html=html)
    except Exception as e:
        logger.error(f"notify email error: {e}")
