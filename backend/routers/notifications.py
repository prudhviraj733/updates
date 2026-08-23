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
    if not to:
        return
    _assert_safe_email(subject, html)
    # Preferred: production SMTP (env-driven). Falls back to Emergent email if SMTP unset.
    smtp_host = os.environ.get("SMTP_HOST")
    if smtp_host:
        def _smtp_send():
            import smtplib
            from email.mime.text import MIMEText
            from email.utils import formataddr
            msg = MIMEText(html, "html", "utf-8")
            msg["Subject"] = subject
            from_email = os.environ.get("SMTP_FROM_EMAIL", os.environ.get("SMTP_USERNAME", ""))
            msg["From"] = formataddr((EMAIL_FROM_NAME, from_email))
            msg["To"] = to
            if EMAIL_REPLY_TO:
                msg["Reply-To"] = EMAIL_REPLY_TO
            port = int(os.environ.get("SMTP_PORT", "587"))
            user = os.environ.get("SMTP_USERNAME")
            pwd = os.environ.get("SMTP_PASSWORD")
            if port == 465:
                s = smtplib.SMTP_SSL(smtp_host, port, timeout=30)
            else:
                s = smtplib.SMTP(smtp_host, port, timeout=30)
                s.starttls()
            if user and pwd:
                s.login(user, pwd)
            s.sendmail(from_email, [to], msg.as_string())
            s.quit()
        try:
            await asyncio.to_thread(_smtp_send)
        except Exception as e:
            logger.error(f"SMTP send failed: {e}")
        return
    if not EMAIL_KEY:
        return
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


# ---------------- Twilio Verify (production OTP) ----------------
def _twilio_client():
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    if not sid or not token:
        return None
    from twilio.rest import Client
    return Client(sid, token)


def twilio_verify_enabled() -> bool:
    return bool(os.environ.get("TWILIO_ACCOUNT_SID") and os.environ.get("TWILIO_AUTH_TOKEN")
                and os.environ.get("TWILIO_VERIFY_SERVICE_SID"))


def _verify_start_sync(phone: str) -> str:
    c = _twilio_client()
    vs = os.environ.get("TWILIO_VERIFY_SERVICE_SID")
    return c.verify.v2.services(vs).verifications.create(to=phone, channel="sms").status


def _verify_check_sync(phone: str, code: str) -> bool:
    c = _twilio_client()
    vs = os.environ.get("TWILIO_VERIFY_SERVICE_SID")
    return c.verify.v2.services(vs).verification_checks.create(to=phone, code=code).status == "approved"


async def verify_start(phone: str) -> str:
    return await asyncio.to_thread(_verify_start_sync, phone)


async def verify_check(phone: str, code: str) -> bool:
    return await asyncio.to_thread(_verify_check_sync, phone, code)


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


async def send_payment_receipt(order: dict) -> None:
    """Email a payment receipt once an order's payment is confirmed."""
    order_no = order.get("order_number", "")
    email = None
    try:
        user = await db.users.find_one({"_id": ObjectId(order["user_id"])}, {"email": 1})
        email = user.get("email") if user else None
    except Exception:
        email = None
    if not email:
        return
    rows = "".join(
        f'<tr><td style="padding:4px 0">{escape(str(it.get("name", "")))} &times; {it.get("quantity", 1)}</td>'
        f'<td style="padding:4px 0;text-align:right">&#8377;{it.get("line_total", 0)}</td></tr>'
        for it in order.get("items", []))
    pay_ref = escape(str(order.get("razorpay_payment_id") or order.get("payment_method", "")))
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;'
        f'font-family:Arial,sans-serif;color:#111">'
        f'<h2 style="color:#1B4332;margin:0 0 8px">Payment received</h2>'
        f'<p>Hi {escape(order.get("customer_name", "there"))}, thanks for your payment. '
        f'Here is your receipt.</p>'
        f'<p>Order <strong>{escape(order_no)}</strong><br>Payment ref: {pay_ref}</p>'
        f'<table width="100%" style="border-top:1px solid #eee;border-bottom:1px solid #eee;'
        f'margin:12px 0">{rows}</table>'
        f'<p style="text-align:right">Subtotal: &#8377;{order.get("subtotal", 0)}<br>'
        f'Delivery: &#8377;{order.get("delivery_charge", 0)}<br>'
        f'<strong>Total paid: &#8377;{order.get("final_amount", 0)}</strong></p>'
        f'<p style="font-size:12px;color:#888;margin-top:24px">Sent by {escape(EMAIL_FROM_NAME)}. '
        f'This is a payment receipt for your records.</p>'
        f'</td></tr></table>'
    )
    try:
        await send_email(to=email, subject=f"{EMAIL_FROM_NAME}: Payment receipt ({order_no})", html=html)
    except Exception as e:
        logger.error(f"receipt email error: {e}")

    try:
        from routers.notifications_center import create_user_notification
        await create_user_notification(
            order["user_id"], "Payment successful",
            f"We've received your payment for order {order_no}.",
            deep_link=f"/orders/{order.get('id')}", ntype="payment",
            data={"order_id": order.get("id")})
    except Exception as e:
        logger.error(f"in-app payment notify error: {e}")


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

    # In-app notification + Android push (shared web/mobile notification system)
    try:
        from routers.notifications_center import create_user_notification
        await create_user_notification(
            order["user_id"], title, line,
            deep_link=f"/orders/{order.get('id')}", ntype="order",
            data={"order_id": order.get("id"), "order_number": order_no, "status": status})
    except Exception as e:
        logger.error(f"in-app order notify error: {e}")
