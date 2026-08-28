import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Truck, Check, ExternalLink, ShieldCheck, Navigation, MapPin, Copy, Phone, FileText, Printer } from "lucide-react";
import api, { inr } from "@/lib/api";
import { getReceipt } from "@/lib/receipt";
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

  const itemsTotal = (order.items || []).reduce((s, it) => s + (it.line_total || 0), 0);
  const FLOW = ["pending", "accepted", "confirmed", "preparing", "ready_for_delivery", "out_for_delivery", "delivered"];
  const curIdx = FLOW.indexOf(order.status);
  const terminal = order.status === "delivered" || order.status === "cancelled";
  const statusDisabled = (s) => {
    if (terminal) return s !== order.status;
    if (s === "cancelled") return false;
    const i = FLOW.indexOf(s);
    return i !== -1 && curIdx !== -1 && i < curIdx;
  };

  const lat = order.address?.latitude, lng = order.address?.longitude;
  const hasCoords = typeof lat === "number" && typeof lng === "number";
  const addressText = [order.address?.line1, order.address?.line2, order.address?.area, order.address?.city, order.pincode || order.address?.pincode].filter(Boolean).join(", ");
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;
  const rapidoUrl = hasCoords ? `geo:${lat},${lng}?q=${lat},${lng}(Delivery)` : "#";
  const custPhone = order.customer_phone || order.address?.phone || "";
  const copyAddress = () => {
    navigator.clipboard?.writeText(addressText + (hasCoords ? ` (${lat}, ${lng})` : ""));
    toast.success("Address copied");
  };

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
          <Badge className={order.is_priority ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600"}>{order.is_priority ? "30-Min Delivery" : "Scheduled"}</Badge>
          <Badge className="bg-forest-light text-forest">{order.customer_status}</Badge>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => getReceipt(`/orders/${order.id}/receipt?download=1`, `Receipt-${order.order_number}.pdf`)} data-testid="admin-download-receipt-btn"><FileText className="mr-1 h-4 w-4" />Receipt</Button>
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => getReceipt(`/orders/${order.id}/receipt`, `Receipt-${order.order_number}.pdf`, { print: true })} data-testid="admin-print-receipt-btn"><Printer className="mr-1 h-4 w-4" />Print</Button>
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
            <p data-testid="order-customer-name">{order.customer_name}</p>
            <p className="flex items-center gap-1.5 text-slate-500" data-testid="order-customer-phone">
              {order.customer_phone || order.address?.phone || "—"}
              {order.customer_phone_verified && (
                <span className="inline-flex items-center gap-0.5 text-xs font-medium text-forest" data-testid="order-phone-verified"><ShieldCheck className="h-3 w-3" />Verified</span>
              )}
            </p>
            <div className="mt-3 text-slate-600" data-testid="order-address">
              <p>{order.address?.full_name} · {order.address?.phone}</p>
              <p>{order.address?.line1}{order.address?.line2 ? `, ${order.address.line2}` : ""}</p>
              <p>{order.address?.area && `${order.address.area}, `}{order.address?.city} - {order.address?.pincode}</p>
            </div>
            <div className="mt-3 space-y-0.5 text-slate-500">
              <p data-testid="order-service-area">Service area: <span className="text-slate-700">{order.location_name}</span></p>
              <p data-testid="order-pincode">PIN code: <span className="text-slate-700">{order.pincode || order.address?.pincode || "—"}</span></p>
              <p data-testid="order-delivery">Delivery: <span className="text-slate-700">{order.delivery_type === "express" || order.delivery_type === "asap" ? "Get in 30 Minutes" : (order.slot_label || "—")}</span></p>
            </div>
            <div className="mt-3 border-t pt-3">
              <p className="mb-2 text-xs font-medium text-slate-500">Delivery location &amp; actions</p>
              {hasCoords
                ? <p className="text-slate-600" data-testid="order-gps">GPS: {lat.toFixed(6)}, {lng.toFixed(6)}</p>
                : <p className="text-slate-400" data-testid="order-gps-missing">No GPS coordinates — address entered manually</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={mapsUrl} target="_blank" rel="noreferrer" data-testid="btn-google-maps" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Navigation className="h-3.5 w-3.5" />Google Maps</a>
                {hasCoords && <a href={rapidoUrl} data-testid="btn-rapido" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><MapPin className="h-3.5 w-3.5" />Rapido / Maps app</a>}
                <button onClick={copyAddress} data-testid="btn-copy-address" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Copy className="h-3.5 w-3.5" />Copy address</button>
                {custPhone && <a href={`tel:${custPhone}`} data-testid="btn-call-customer" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium text-forest hover:bg-slate-50"><Phone className="h-3.5 w-3.5" />Call</a>}
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 text-sm">
            <p className="mb-3 font-semibold">Payment Summary</p>
            {order.combo_discount > 0 && <Row l="Items total" v={inr(itemsTotal)} />}
            {order.combo_discount > 0 && <Row l="Combo savings" v={`- ${inr(order.combo_discount)}`} muted />}
            <Row l="Subtotal" v={inr(order.subtotal)} />
            {order.coupon_discount > 0 && <Row l={`Coupon ${order.coupon_code || ""}`} v={`- ${inr(order.coupon_discount)}`} muted />}
            <Row l="Delivery" v={order.free_delivery_applied ? "FREE" : inr(order.delivery_charge)} />
            {(order.express_charge ?? order.asap_charge) > 0 && <Row l="30-min delivery charge" v={inr(order.express_charge ?? order.asap_charge)} />}
            {order.delivery_discount > 0 && <Row l={`Delivery coupon ${order.delivery_coupon_code || ""}`} v={`- ${inr(order.delivery_discount)}`} muted />}
            {order.wallet_used > 0 && <Row l="Wallet used" v={`- ${inr(order.wallet_used)}`} muted />}
            {order.gst?.enabled && (order.gst.by_rate || []).map((b) => (
              <Row key={b.rate} l={`GST @ ${b.rate}% (taxable ${inr(b.taxable)})${order.gst.pricing === "inclusive" ? " incl." : ""}`} v={`${order.gst.pricing === "inclusive" ? "" : "+ "}${inr(b.tax)}`} muted />
            ))}
            {order.gst?.enabled && <Row l="Total GST" v={inr(order.gst.total_tax)} muted />}
            <div className="my-2 border-t" />
            <Row l="Total payable" v={inr(order.final_amount)} bold />
            {order.product_discount > 0 && <p className="mt-1 text-xs text-forest" data-testid="order-mrp-savings">You saved {inr(order.product_discount)} off MRP</p>}
            <p className="mt-2 text-xs text-slate-400" data-testid="order-payment-meta">{order.payment_method?.toUpperCase()} · {order.payment_status}</p>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <Label>Update internal status</Label>
            <Select value={order.status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1" data-testid="order-status-select"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} disabled={statusDisabled(s)}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
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
