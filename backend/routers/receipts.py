"""Transaction PDF receipts (orders, wallet, refunds).

Receipts are generated on demand from authoritative DB data — nothing is stored,
no historical amounts are recalculated. Works for both new and historical records.
Access is ownership-checked (customers see only their own; admins see any).
"""
from io import BytesIO
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

from core.db import db
from core.security import get_current_user
from routers.settings import load_settings

router = APIRouter()

FOREST = colors.HexColor("#1B4332")
LIGHT = colors.HexColor("#D8F3DC")
GREY = colors.HexColor("#6B7280")

S_TITLE = ParagraphStyle("t", fontSize=18, textColor=colors.white, leading=22, fontName="Helvetica-Bold")
S_TITLE_R = ParagraphStyle("tr", fontSize=13, textColor=colors.white, alignment=TA_RIGHT, fontName="Helvetica-Bold")
S_SUB_R = ParagraphStyle("sr", fontSize=8.5, textColor=colors.white, alignment=TA_RIGHT)
S_H = ParagraphStyle("h", fontSize=10, textColor=FOREST, fontName="Helvetica-Bold", spaceAfter=3)
S = ParagraphStyle("s", fontSize=9, textColor=colors.black, leading=12)
S_SMALL = ParagraphStyle("sm", fontSize=8, textColor=GREY, leading=11)
S_CELL = ParagraphStyle("c", fontSize=8.5, leading=11)
S_FOOT = ParagraphStyle("f", fontSize=8, textColor=GREY, alignment=TA_LEFT, leading=11)


def _rs(x) -> str:
    return "Rs. {:,.2f}".format(float(x or 0))


def _fmt_dt(iso) -> str:
    if not iso:
        return "-"
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return dt.strftime("%d %b %Y, %I:%M %p")
    except Exception:
        return str(iso)[:19]


def _pay_method(m) -> str:
    m = (m or "").lower()
    if m == "cod":
        return "Cash on Delivery (COD)"
    if m in ("online", "razorpay"):
        return "Online (Razorpay)"
    return (m or "-").title()


def _header(store_name, title, sub=""):
    right = [Paragraph(title, S_TITLE_R)]
    if sub:
        right.append(Paragraph(sub, S_SUB_R))
    t = Table([[Paragraph(store_name, S_TITLE), right]], colWidths=[105 * mm, 65 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FOREST),
        ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 14), ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def _kv(rows):
    data = [[Paragraph(f"<b>{k}</b>", S_CELL), Paragraph(str(v), S_CELL)] for k, v in rows]
    t = Table(data, colWidths=[32 * mm, 51 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _two_col(left, right):
    t = Table([[left, right]], colWidths=[85 * mm, 85 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return t


def _totals(rows):
    """rows: list of (label, value_str, bold)."""
    data = []
    for label, val, bold in rows:
        ls = ParagraphStyle("tl", parent=S, alignment=TA_RIGHT, fontName="Helvetica-Bold" if bold else "Helvetica",
                            fontSize=11 if bold else 9)
        vs = ParagraphStyle("tv", parent=S, alignment=TA_RIGHT, fontName="Helvetica-Bold" if bold else "Helvetica",
                            fontSize=11 if bold else 9)
        data.append([Paragraph(label, ls), Paragraph(val, vs)])
    t = Table(data, colWidths=[45 * mm, 38 * mm], hAlign="RIGHT")
    styles = [("LINEABOVE", (0, len(rows) - 1), (-1, len(rows) - 1), 0.7, FOREST),
              ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]
    t.setStyle(TableStyle(styles))
    return t


def _build(elements) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm, title="Receipt")
    doc.build(elements)
    return buf.getvalue()


def _store_meta(settings):
    return (settings.get("store_name") or "SavingSmart Grocery",
            settings.get("support_email") or "", settings.get("support_phone") or "",
            settings.get("gst_number") or "")


def _footer(store_name, email, phone, gst):
    lines = [f"Thank you for shopping with {store_name}. This is a system-generated receipt and does not require a signature."]
    contact = " · ".join([x for x in [f"Email: {email}" if email else "", f"Phone: {phone}" if phone else ""] if x])
    if contact:
        lines.append(contact)
    if gst:
        lines.append(f"GSTIN: {gst}")
    else:
        lines.append("All prices are inclusive of applicable taxes.")
    return [Spacer(1, 10 * mm)] + [Paragraph(l, S_FOOT) for l in lines]


# ---------------- Order receipt ----------------
def build_order_pdf(order: dict, settings: dict) -> bytes:
    store, email, phone, gst = _store_meta(settings)
    el = [_header(store, "TAX INVOICE / RECEIPT", f"Receipt No: INV-{order.get('order_number', '')}"),
          Spacer(1, 6 * mm)]

    pstatus = (order.get("payment_status") or "pending").title()
    left = _kv([
        ("Order No", order.get("order_number", "-")),
        ("Order ID", order.get("id", "-")),
        ("Date", _fmt_dt(order.get("created_at"))),
        ("Order Status", (order.get("status") or "-").replace("_", " ").title()),
    ])
    addr = order.get("address") or {}
    addr_txt = ""
    if addr:
        parts = [addr.get("line1"), addr.get("line2"), addr.get("area"),
                 f"{addr.get('city', '')} - {addr.get('pincode', '')}"]
        addr_txt = "<br/>".join([p for p in parts if p and str(p).strip(" -")])
    bill = _kv([
        ("Billed To", order.get("customer_name", "-")),
        ("Phone", order.get("customer_phone", "-") or "-"),
        ("Delivery", addr_txt or "-"),
    ])
    el += [_two_col(left, bill), Spacer(1, 5 * mm)]

    # Items
    header = [Paragraph("<b>#</b>", S_CELL), Paragraph("<b>Item</b>", S_CELL),
              Paragraph("<b>Qty</b>", S_CELL), Paragraph("<b>Rate</b>", S_CELL),
              Paragraph("<b>Amount</b>", S_CELL)]
    rows = [header]
    for i, it in enumerate(order.get("items", []), 1):
        name = it.get("name", "-")
        extra = it.get("pack_size") or ""
        if it.get("combo_name"):
            extra = (extra + " · " if extra else "") + f"Part of {it['combo_name']}"
        cell = f"<b>{name}</b>" + (f"<br/><font size=7 color='#6B7280'>{extra}</font>" if extra else "")
        rows.append([Paragraph(str(i), S_CELL), Paragraph(cell, S_CELL),
                     Paragraph(str(it.get("quantity", 1)), S_CELL),
                     Paragraph(_rs(it.get("unit_price")), S_CELL),
                     Paragraph(_rs(it.get("line_total")), S_CELL)])
    if len(rows) == 1:
        rows.append([Paragraph("", S_CELL), Paragraph("No line items recorded for this order.", S_SMALL),
                     Paragraph("", S_CELL), Paragraph("", S_CELL), Paragraph("", S_CELL)])
    tbl = Table(rows, colWidths=[8 * mm, 96 * mm, 12 * mm, 26 * mm, 28 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("TEXTCOLOR", (0, 0), (-1, 0), FOREST),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, FOREST),
        ("LINEBELOW", (0, 1), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    el += [tbl, Spacer(1, 4 * mm)]

    # Totals
    tr = [("Subtotal", _rs(order.get("subtotal")), False)]
    if (order.get("product_discount") or 0) > 0:
        tr.append(("MRP savings", "- " + _rs(order["product_discount"]), False))
    if (order.get("combo_discount") or 0) > 0:
        tr.append(("Combo savings", "- " + _rs(order["combo_discount"]), False))
    if (order.get("coupon_discount") or 0) > 0:
        lbl = "Coupon" + (f" ({order.get('coupon_code')})" if order.get("coupon_code") else "")
        tr.append((lbl, "- " + _rs(order["coupon_discount"]), False))
    tr.append(("Delivery charge", _rs(order.get("delivery_charge")), False))
    exp = order.get("express_charge") or order.get("asap_charge") or 0
    if exp > 0:
        tr.append(("Get in 30 Minutes", "+ " + _rs(exp), False))
    if (order.get("delivery_discount") or 0) > 0:
        lbl = "Delivery coupon" + (f" ({order.get('delivery_coupon_code')})" if order.get("delivery_coupon_code") else "")
        tr.append((lbl, "- " + _rs(order["delivery_discount"]), False))
    if (order.get("wallet_used") or 0) > 0:
        tr.append(("Paid via Wallet", "- " + _rs(order["wallet_used"]), False))
    tr.append(("Amount Payable", _rs(order.get("final_amount")), True))
    el += [_totals(tr), Spacer(1, 5 * mm)]

    # Payment box
    pay_rows = [("Payment Method", _pay_method(order.get("payment_method"))),
                ("Payment Status", pstatus)]
    if order.get("razorpay_payment_id"):
        pay_rows.append(("Razorpay Payment ID", order["razorpay_payment_id"]))
    if order.get("razorpay_order_id"):
        pay_rows.append(("Razorpay Order ID", order["razorpay_order_id"]))
    note = ""
    if (order.get("payment_method") or "").lower() == "cod" and (order.get("payment_status") or "") != "paid":
        note = "This COD order is not yet paid. Payment is collected on delivery."
    elif (order.get("payment_status") or "") == "refunded":
        note = "This order was refunded."
    el += [Paragraph("Payment Details", S_H), _kv(pay_rows)]
    if note:
        el += [Spacer(1, 2 * mm), Paragraph(note, S_SMALL)]
    el += _footer(store, email, phone, gst)
    return _build(el)


# ---------------- Wallet receipt ----------------
def build_wallet_pdf(entry: dict, settings: dict, customer_name: str) -> bytes:
    store, email, phone, gst = _store_meta(settings)
    amt = entry.get("amount", 0)
    direction = "Credit" if amt >= 0 else "Debit"
    el = [_header(store, "WALLET RECEIPT", f"Receipt No: WRC-{entry.get('txn_id', entry.get('id', ''))}"),
          Spacer(1, 6 * mm)]
    rows = [
        ("Transaction ID", entry.get("txn_id", entry.get("id", "-"))),
        ("Date", _fmt_dt(entry.get("created_at"))),
        ("Customer", customer_name or "-"),
        ("Type", (entry.get("source") or entry.get("reason") or "-").replace("_", " ").title()),
        ("Direction", direction),
        ("Amount", _rs(abs(amt))),
        ("Status", (entry.get("status") or "completed").title()),
        ("Balance After", _rs(entry.get("balance_after"))),
    ]
    if entry.get("order_id"):
        rows.append(("Related Order", entry["order_id"]))
    if entry.get("payment_ref"):
        rows.append(("Payment Reference", entry["payment_ref"]))
    if entry.get("notes"):
        rows.append(("Notes", entry["notes"]))
    el += [_kv(rows)]
    el += _footer(store, email, phone, gst)
    return _build(el)


# ---------------- Refund receipt ----------------
def build_refund_pdf(r: dict, settings: dict) -> bytes:
    store, email, phone, gst = _store_meta(settings)
    refund = r.get("refund") or {}
    el = [_header(store, "REFUND RECEIPT", f"Receipt No: RFD-{r.get('request_number', '')}"),
          Spacer(1, 6 * mm)]
    left = _kv([
        ("Request No", r.get("request_number", "-")),
        ("Order No", r.get("order_number", "-")),
        ("Date", _fmt_dt(refund.get("at") or r.get("updated_at"))),
        ("Status", (r.get("status") or "-").replace("_", " ").title()),
    ])
    right = _kv([
        ("Customer", r.get("customer_name", "-")),
        ("Product", r.get("product_name", "-")),
        ("Quantity", r.get("quantity", 1)),
        ("Item Value", _rs(r.get("line_amount"))),
    ])
    el += [_two_col(left, right), Spacer(1, 5 * mm)]

    method = (refund.get("method") or "").lower()
    method_label = "Razorpay (to source)" if method == "razorpay" else ("Wallet credit" if method else "-")
    tr = [("Refund Amount", _rs(refund.get("amount")), True)]
    el += [_totals(tr), Spacer(1, 5 * mm), Paragraph("Refund Details", S_H)]
    prows = [("Refund Method", method_label),
             ("Reason", refund.get("reason") or r.get("reason_label") or "-")]
    if refund.get("reference_id"):
        prows.append(("Reference ID", refund["reference_id"]))
    el += [_kv(prows)]
    el += _footer(store, email, phone, gst)
    return _build(el)


def _pdf_response(pdf: bytes, filename: str, download: int):
    disp = "attachment" if download else "inline"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'{disp}; filename="{filename}"'})


# ---------------- Endpoints ----------------
@router.get("/orders/{order_id}/receipt")
async def order_receipt(order_id: str, download: int = 0, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("user_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    settings = await load_settings()
    pdf = build_order_pdf(order, settings)
    return _pdf_response(pdf, f"Receipt-{order.get('order_number', order_id)}.pdf", download)


@router.get("/wallet/receipt/{txn_id}")
async def wallet_receipt(txn_id: str, download: int = 0, user: dict = Depends(get_current_user)):
    entry = await db.wallet_ledger.find_one({"txn_id": txn_id}, {"_id": 0}) \
        or await db.wallet_ledger.find_one({"id": txn_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Wallet transaction not found")
    if entry.get("user_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    settings = await load_settings()
    name = user.get("name", "")
    if user.get("role") == "admin" and entry.get("user_id") != user["id"]:
        owner = await db.users.find_one({"_id": _oid(entry["user_id"])}) if entry.get("user_id") else None
        name = (owner or {}).get("name", "")
    pdf = build_wallet_pdf(entry, settings, name)
    return _pdf_response(pdf, f"Wallet-{entry.get('txn_id', txn_id)}.pdf", download)


@router.get("/returns/{request_id}/receipt")
async def refund_receipt(request_id: str, download: int = 0, user: dict = Depends(get_current_user)):
    r = await db.returns.find_one({"id": request_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    if r.get("user_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    if not r.get("refund"):
        raise HTTPException(status_code=400, detail="No refund has been processed for this request yet")
    settings = await load_settings()
    pdf = build_refund_pdf(r, settings)
    return _pdf_response(pdf, f"Refund-{r.get('request_number', request_id)}.pdf", download)


def _oid(v):
    from bson import ObjectId
    try:
        return ObjectId(v)
    except Exception:
        return v
