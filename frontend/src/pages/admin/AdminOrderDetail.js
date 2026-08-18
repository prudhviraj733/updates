import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Truck, Check, ExternalLink } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUSES = ["pending", "accepted", "confirmed", "preparing", "ready_for_delivery", "out_for_delivery", "delivered", "cancelled"];

export default function AdminOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [tracking, setTracking] = useState("");
  const [provider, setProvider] = useState("rapido");

  const load = () => api.get(`/orders/${id}`).then(({ data }) => { setOrder(data); setTracking(data.tracking_url || ""); setProvider(data.tracking_provider || "rapido"); });
  useEffect(() => { load(); }, [id]);

  const accept = async () => { try { await api.put(`/admin/orders/${id}/accept`); toast.success("Order accepted"); load(); } catch (e) { toast.error(e.response?.data?.detail || "Error"); } };
  const setStatus = async (s) => { try { await api.put(`/admin/orders/${id}/status`, { status: s }); toast.success("Status updated"); load(); } catch (e) { toast.error(e.response?.data?.detail || "Error"); } };
  const saveTracking = async () => { try { await api.put(`/admin/orders/${id}/tracking`, { tracking_url: tracking, tracking_provider: provider }); toast.success("Tracking link saved"); load(); } catch (e) { toast.error(e.response?.data?.detail || "Error"); } };

  if (!order) return <div className="p-6 text-slate-400">Loading…</div>;

  return (
    <div data-testid="admin-order-detail" className="max-w-5xl">
      <button onClick={() => navigate("/admin/orders")} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-forest"><ArrowLeft className="h-4 w-4" />Back to orders</button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Order {order.order_number}</h1>
          <p className="text-sm text-slate-500">{new Date(order.created_at).toLocaleString()} · {order.location_name}</p>
        </div>
        <div className="flex items-center gap-2">
          {!order.accepted && order.status === "pending" && (
            <Button className="bg-forest hover:bg-forest-dark" onClick={accept} data-testid="accept-order-btn"><Check className="mr-1 h-4 w-4" />Accept Order</Button>
          )}
          <Badge className={order.is_priority ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600"}>{order.is_priority ? "ASAP" : "Scheduled"}</Badge>
          <Badge className="bg-forest-light text-forest">{order.customer_status}</Badge>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border bg-white">
            <div className="border-b p-3 text-sm font-semibold">Items</div>
            {order.items.map((it) => (
              <div key={it.product_id} className="flex items-center gap-3 border-b p-3 last:border-0" data-testid={`order-item-${it.product_id}`}>
                <img src={it.image || "https://via.placeholder.com/48"} className="h-12 w-12 rounded object-cover" alt="" />
                <div className="flex-1"><p className="text-sm font-medium">{it.name}</p><p className="text-xs text-slate-400">{it.pack_size} · {inr(it.unit_price)} × {it.quantity}</p></div>
                <p className="text-sm font-semibold">{inr(it.line_total)}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border bg-white p-4 text-sm">
            <p className="mb-3 font-semibold">Delivery Tracking</p>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
              <div>
                <Label>Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger data-testid="tracking-provider"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="rapido">Rapido</SelectItem><SelectItem value="google_maps">Google Maps</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Tracking link (optional)</Label><Input data-testid="tracking-url" placeholder="https://…" value={tracking} onChange={(e) => setTracking(e.target.value)} /></div>
              <Button variant="outline" onClick={saveTracking} data-testid="save-tracking-btn"><Truck className="mr-1 h-4 w-4" />Save</Button>
            </div>
            {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-forest hover:underline" data-testid="tracking-link"><ExternalLink className="h-3 w-3" />Open live tracking</a>}
          </div>

          <div className="rounded-xl border bg-white p-4">
            <p className="mb-3 text-sm font-semibold">Status Timeline</p>
            <div className="space-y-2">
              {order.status_history?.map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-sm"><span className="h-2 w-2 rounded-full bg-forest" /><span className="capitalize">{h.status.replace(/_/g, " ")}</span><span className="text-xs text-slate-400">{new Date(h.at).toLocaleString()}</span></div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border bg-white p-4 text-sm">
            <p className="mb-2 font-semibold">Customer</p>
            <p>{order.customer_name}</p><p className="text-slate-500">{order.customer_phone}</p>
            <div className="mt-3 text-slate-600">
              <p>{order.address?.full_name} · {order.address?.phone}</p>
              <p>{order.address?.line1}{order.address?.line2 ? `, ${order.address.line2}` : ""}</p>
              <p>{order.address?.area} {order.address?.city} - {order.address?.pincode}</p>
            </div>
            <p className="mt-3 text-slate-500">{order.delivery_type === "asap" ? "ASAP (~2 hrs)" : order.slot_label}</p>
          </div>

          <div className="rounded-xl border bg-white p-4 text-sm">
            <p className="mb-3 font-semibold">Payment Summary</p>
            <Row l="Subtotal" v={inr(order.subtotal)} />
            {order.product_discount > 0 && <Row l="Product savings" v={`- ${inr(order.product_discount)}`} muted />}
            {order.coupon_discount > 0 && <Row l={`Coupon ${order.coupon_code || ""}`} v={`- ${inr(order.coupon_discount)}`} muted />}
            <Row l="Delivery" v={order.free_delivery_applied ? "FREE" : inr(order.delivery_charge)} />
            {order.asap_charge > 0 && <Row l="ASAP charge" v={inr(order.asap_charge)} />}
            <div className="my-2 border-t" />
            <Row l="Total" v={inr(order.final_amount)} bold />
            <p className="mt-2 text-xs text-slate-400">{order.payment_method?.toUpperCase()} · {order.payment_status}</p>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <Label>Update internal status</Label>
            <Select value={order.status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1" data-testid="order-status-select"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
            <p className="mt-2 text-xs text-slate-400">Customer sees: <b>{order.customer_status}</b></p>
          </div>
        </div>
      </div>
    </div>
  );
}

const Row = ({ l, v, bold, muted }) => (
  <div className="flex justify-between py-0.5"><span className={muted ? "text-forest" : "text-slate-500"}>{l}</span><span className={bold ? "font-bold" : muted ? "text-forest" : ""}>{v}</span></div>
);
