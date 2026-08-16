import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Package, ChevronRight, Zap, Clock } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  preparing: "bg-indigo-100 text-indigo-700",
  ready_for_delivery: "bg-purple-100 text-purple-700",
  out_for_delivery: "bg-cyan-100 text-cyan-700",
  delivered: "bg-forest-light text-forest",
  cancelled: "bg-red-100 text-red-700",
};
const label = (s) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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
              <Badge className={`${STATUS_COLORS[o.status]} hover:${STATUS_COLORS[o.status]}`}>{label(o.status)}</Badge>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  useEffect(() => { api.get(`/orders/${id}`).then(({ data }) => setOrder(data)); }, [id]);
  if (!order) return <div className="mx-auto max-w-3xl px-4 py-8"><Skeleton className="h-96 rounded-2xl" /></div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{order.order_number}</h1>
          <p className="text-sm text-muted-foreground">Placed {new Date(order.created_at).toLocaleString()}</p>
        </div>
        <div className="flex gap-2">
          {order.is_priority && <Badge className="bg-saffron text-white hover:bg-saffron"><Zap className="mr-1 h-3 w-3" />Priority</Badge>}
          <Badge className={`${STATUS_COLORS[order.status]} hover:${STATUS_COLORS[order.status]}`}>{label(order.status)}</Badge>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-black/5 bg-white p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {order.delivery_type === "asap" ? <Zap className="h-4 w-4 text-saffron" /> : <Clock className="h-4 w-4 text-forest" />}
          {order.delivery_type === "asap" ? "As Soon As Possible delivery" : `Delivery slot: ${order.slot_label || "-"}`}
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
              <img src={i.image} alt={i.name} className="h-12 w-12 rounded-lg object-cover bg-cream" />
              <div className="flex-1"><p className="text-sm font-medium">{i.name}</p><p className="text-xs text-muted-foreground">{i.pack_size} · Qty {i.quantity}</p></div>
              <span className="font-medium">{inr(i.line_total)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1 border-t pt-4 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{inr(order.subtotal)}</span></div>
          {order.coupon_discount > 0 && <div className="flex justify-between text-forest"><span>Coupon ({order.coupon_code})</span><span>-{inr(order.coupon_discount)}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{inr(order.delivery_charge)}</span></div>
          {order.asap_charge > 0 && <div className="flex justify-between text-saffron"><span>Priority (ASAP)</span><span>+{inr(order.asap_charge)}</span></div>}
          <div className="flex justify-between pt-2 text-lg font-bold"><span>Total</span><span>{inr(order.final_amount)}</span></div>
        </div>
      </div>
    </div>
  );
}
