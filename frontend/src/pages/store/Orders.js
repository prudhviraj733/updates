import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Package, ChevronRight, Zap, Clock, ExternalLink, CheckCircle2, Circle, FileText, Printer } from "lucide-react";
import api, { inr } from "@/lib/api";
import { getReceipt } from "@/lib/receipt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_COLORS = {
  "Order Placed": "bg-amber-100 text-amber-700",
  "Order Confirmed": "bg-blue-100 text-blue-700",
  "Being Prepared": "bg-indigo-100 text-indigo-700",
  "Packed & Ready": "bg-purple-100 text-purple-700",
  "Out for Delivery": "bg-cyan-100 text-cyan-700",
  "Delivered": "bg-forest-light text-forest",
  "Cancelled": "bg-red-100 text-red-700",
};
// customer-facing journey steps in order
const JOURNEY = ["Order Placed", "Order Confirmed", "Being Prepared", "Packed & Ready", "Out for Delivery", "Delivered"];

export function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState(null);

  useEffect(() => { api.get("/orders").then(({ data }) => setOrders(data)); }, []);

  if (!orders) return <div className="mx-auto max-w-3xl px-4 py-8 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-bold">My Orders</h1>
      {orders.length === 0 ? (
        <div className="mt-16 text-center"><Package className="mx-auto h-14 w-14 text-muted-foreground/40" /><p className="mt-4 font-medium">No orders yet</p></div>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((o) => (
            <button key={o.id} data-testid={`order-row-${o.id}`} onClick={() => navigate(`/orders/${o.id}`)} className="flex w-full items-center gap-4 rounded-2xl border border-black/5 bg-white p-5 text-left hover:shadow-md transition-shadow">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-forest-light text-forest"><Package className="h-6 w-6" /></div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{o.order_number}</p>
                  {o.is_priority && <Zap className="h-4 w-4 text-saffron" />}
                </div>
                <p className="text-sm text-muted-foreground">{o.items.length} items · {inr(o.final_amount)} · {new Date(o.created_at).toLocaleDateString()}</p>
              </div>
              <Badge className={STATUS_COLORS[o.customer_status] || "bg-slate-100 text-slate-600"}>{o.customer_status}</Badge>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const IMG_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%23f0ece3'/%3E%3C/svg%3E";
const RETURN_STATUS_LABELS = {
  requested: "Requested", under_review: "Under Review", rejected: "Rejected",
  refund_approved: "Refund Approved", refund_processing: "Refund Processing", refunded: "Refunded",
  replacement_approved: "Replacement Approved", replacement_scheduled: "Replacement Preparing",
  replacement_out_for_delivery: "Replacement Out for Delivery", replaced: "Replacement Delivered",
};

export function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [returns, setReturns] = useState([]);
  useEffect(() => {
    api.get(`/orders/${id}`).then(({ data }) => setOrder(data));
    api.get(`/me/returns?order_id=${id}`).then(({ data }) => setReturns(data)).catch(() => {});
  }, [id]);
  if (!order) return <div className="mx-auto max-w-3xl px-4 py-8"><Skeleton className="h-96 rounded-2xl" /></div>;

  const cancelled = order.status === "cancelled";
  const reachedIdx = JOURNEY.indexOf(order.customer_status);
  const historyAt = {};
  (order.status_history || []).forEach((h) => {
    const map = { pending: "Order Placed", accepted: "Order Confirmed", confirmed: "Order Confirmed", preparing: "Being Prepared", ready_for_delivery: "Packed & Ready", out_for_delivery: "Out for Delivery", delivered: "Delivered" };
    if (map[h.status]) historyAt[map[h.status]] = h.at;
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{order.order_number}</h1>
          <p className="text-sm text-muted-foreground">Placed {new Date(order.created_at).toLocaleString()}</p>
        </div>
        <div className="flex gap-2">
          {order.is_priority && <Badge className="bg-saffron text-white hover:bg-saffron"><Zap className="mr-1 h-3 w-3" />Priority</Badge>}
          <Badge className={STATUS_COLORS[order.customer_status] || "bg-slate-100 text-slate-600"}>{order.customer_status}</Badge>
        </div>
      </div>

      {/* Live tracking timeline */}
      <div className="mt-6 rounded-2xl border border-black/5 bg-white p-6" data-testid="order-tracking">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Track your order</h2>
          {order.tracking_url && order.status === "out_for_delivery" && (
            <Button asChild size="sm" className="rounded-full bg-forest hover:bg-forest-dark" data-testid="live-tracking-btn">
              <a href={order.tracking_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-4 w-4" />Live tracking</a>
            </Button>
          )}
        </div>
        {cancelled ? (
          <p className="mt-4 text-sm font-medium text-red-600">This order was cancelled.{order.payment_status === "refunded" ? " Amount refunded to your wallet." : ""}</p>
        ) : (
          <ol className="mt-5 space-y-4">
            {JOURNEY.map((step, i) => {
              const done = i <= reachedIdx;
              const current = i === reachedIdx;
              return (
                <li key={step} className="flex items-start gap-3" data-testid={`track-step-${i}`}>
                  {done ? <CheckCircle2 className={`h-5 w-5 ${current ? "text-saffron" : "text-forest"}`} /> : <Circle className="h-5 w-5 text-muted-foreground/40" />}
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${done ? "" : "text-muted-foreground"}`}>{step}</p>
                    {historyAt[step] && <p className="text-xs text-muted-foreground">{new Date(historyAt[step]).toLocaleString()}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-black/5 bg-white p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {order.delivery_type === "express" || order.delivery_type === "asap" ? <Zap className="h-4 w-4 text-saffron" /> : <Clock className="h-4 w-4 text-forest" />}
          {order.delivery_type === "express" || order.delivery_type === "asap" ? "Get in 30 Minutes" : `Delivery slot: ${order.slot_label || "-"}`}
        </div>
        <p className="mt-2 text-sm">Payment: <span className="font-medium">{order.payment_method === "cod" ? "Cash on Delivery" : "Online (Razorpay)"}</span> · <span className="capitalize">{order.payment_status}</span></p>
        <div className="mt-4 rounded-xl bg-cream p-4 text-sm">
          <p className="font-medium">{order.address?.full_name} · {order.address?.phone}</p>
          <p className="text-muted-foreground">{order.address?.line1}, {order.address?.area && `${order.address.area}, `}{order.address?.city} - {order.address?.pincode}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-black/5 bg-white p-6">
        <h2 className="font-heading text-lg font-bold">Items</h2>
        <div className="mt-3 divide-y">
          {order.items.map((i) => (
            <div key={i.product_id} className="flex items-center gap-3 py-3">
              <img src={i.image || IMG_PLACEHOLDER} alt={i.name} className="h-12 w-12 rounded-lg object-cover bg-cream" />
              <div className="flex-1"><p className="text-sm font-medium">{i.name}</p><p className="text-xs text-muted-foreground">{i.pack_size} · Qty {i.quantity}</p></div>
              <span className="font-medium">{inr(i.line_total)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1 border-t pt-4 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{inr(order.subtotal)}</span></div>
          {order.gst?.enabled && order.gst.pricing === "exclusive" && (order.gst.total_tax || 0) > 0 && (order.gst.by_rate || []).map((b) => (
            <div key={b.rate} className="flex justify-between text-muted-foreground"><span>GST @ {b.rate}%</span><span>+{inr(b.tax)}</span></div>
          ))}
          {order.coupon_discount > 0 && <div className="flex justify-between text-forest"><span>Coupon ({order.coupon_code})</span><span>-{inr(order.coupon_discount)}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{inr(order.delivery_charge)}</span></div>
          {(order.express_charge ?? order.asap_charge) > 0 && <div className="flex justify-between text-saffron"><span>Get in 30 Minutes</span><span>+{inr(order.express_charge ?? order.asap_charge)}</span></div>}
          {order.delivery_discount > 0 && <div className="flex justify-between text-blue-700"><span>Delivery coupon ({order.delivery_coupon_code})</span><span>-{inr(order.delivery_discount)}</span></div>}
          {order.wallet_used > 0 && <div className="flex justify-between text-forest"><span>Wallet</span><span>-{inr(order.wallet_used)}</span></div>}
          <div className="flex justify-between pt-2 text-lg font-bold"><span>{order.payment_status === "paid" ? "Total paid" : "Total payable"}</span><span>{inr(order.final_amount)}</span></div>
          {order.gst?.enabled && (order.gst.total_tax || 0) > 0 && (
            <p className="pt-1 text-xs text-muted-foreground" data-testid="order-gst-note">{order.gst.pricing === "inclusive" ? "Inclusive of" : "Includes"} GST {inr(order.gst.total_tax)}{order.gst.gstin ? ` · GSTIN ${order.gst.gstin}` : ""}</p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          <Button variant="outline" className="rounded-full" onClick={() => getReceipt(`/orders/${order.id}/receipt?download=1`, `Receipt-${order.order_number}.pdf`)} data-testid="download-receipt-btn"><FileText className="mr-1.5 h-4 w-4" />Download Receipt</Button>
          <Button variant="ghost" className="rounded-full" onClick={() => getReceipt(`/orders/${order.id}/receipt`, `Receipt-${order.order_number}.pdf`, { print: true })} data-testid="print-receipt-btn"><Printer className="mr-1.5 h-4 w-4" />Print</Button>
        </div>
      </div>

      {/* Refund / Replacement */}
      {order.status === "delivered" && (
        <div className="mt-4 rounded-2xl border border-black/5 bg-white p-6" data-testid="return-section">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-bold">Issue with an item?</h2>
              <p className="text-sm text-muted-foreground">Request a refund or replacement for a specific item.</p>
            </div>
            <Button className="rounded-full bg-forest hover:bg-forest-dark" onClick={() => navigate(`/orders/${order.id}/return`)} data-testid="refund-replace-btn">Refund / Replace Item</Button>
          </div>
          {returns.length > 0 && (
            <div className="mt-4 space-y-2 border-t pt-4">
              {returns.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm" data-testid={`my-return-${r.id}`}>
                  <span>{r.product_name} × {r.quantity} · <span className="capitalize">{r.type}</span></span>
                  <div className="flex items-center gap-2">
                    <Badge className={r.status === "rejected" ? "bg-red-100 text-red-700" : ["refunded", "replaced"].includes(r.status) ? "bg-forest-light text-forest" : "bg-amber-100 text-amber-700"}>{RETURN_STATUS_LABELS[r.status] || r.customer_status_label}</Badge>
                    {r.status === "refunded" && r.refund && <button onClick={() => getReceipt(`/returns/${r.id}/receipt?download=1`, `Refund-${r.request_number}.pdf`)} className="inline-flex items-center gap-1 text-xs font-medium text-forest hover:underline" data-testid={`refund-receipt-${r.id}`}><FileText className="h-3.5 w-3.5" />Refund receipt</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
