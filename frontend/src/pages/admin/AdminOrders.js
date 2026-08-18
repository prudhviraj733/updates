import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Zap, Bell, Check } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUSES = ["pending", "accepted", "confirmed", "preparing", "ready_for_delivery", "out_for_delivery", "delivered", "cancelled"];
const label = (s) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    o.start();
    o.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.stop(ctx.currentTime + 0.4);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } catch { /* audio not allowed until user interacts */ }
}

export default function AdminOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("");
  const [newCount, setNewCount] = useState(0);
  const prevCount = useRef(0);

  const load = () => { const q = filter ? `?status=${filter}` : ""; api.get(`/admin/orders${q}`).then(({ data }) => setOrders(data)); };
  useEffect(() => { load(); }, [filter]);

  useEffect(() => {
    const poll = () => api.get("/admin/orders/pending-count").then(({ data }) => {
      if (data.count > prevCount.current && prevCount.current !== 0) { beep(); toast.info(`🔔 ${data.count} new order(s) awaiting acceptance`); }
      prevCount.current = data.count; setNewCount(data.count);
    }).catch(() => {});
    poll();
    const t = setInterval(poll, 15000);
    return () => clearInterval(t);
  }, []);

  const changeStatus = async (id, status) => {
    try { await api.put(`/admin/orders/${id}/status`, { status }); toast.success("Status updated"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };
  const accept = async (id) => {
    try { await api.put(`/admin/orders/${id}/accept`); toast.success("Order accepted"); load(); prevCount.current = Math.max(0, prevCount.current - 1); setNewCount((c) => Math.max(0, c - 1)); }
    catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  return (
    <div data-testid="admin-orders">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orders</h1>
        {newCount > 0 && (
          <button onClick={() => setFilter("pending")} data-testid="new-orders-alert" className="flex animate-pulse items-center gap-2 rounded-full bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white shadow">
            <Bell className="h-4 w-4" />{newCount} new order{newCount > 1 ? "s" : ""} — accept now
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => setFilter("")} className={`rounded-full border px-3 py-1 text-sm ${!filter ? "border-forest bg-forest text-white" : ""}`}>All</button>
        {STATUSES.map((s) => <button key={s} onClick={() => setFilter(s)} data-testid={`filter-${s}`} className={`rounded-full border px-3 py-1 text-sm ${filter === s ? "border-forest bg-forest text-white" : ""}`}>{label(s)}</button>)}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Order</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Delivery</th><th className="px-4 py-2">Amount</th><th className="px-4 py-2">Payment</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className={`border-t align-top ${!o.accepted && o.status === "pending" ? "bg-orange-50" : ""}`} data-testid={`admin-order-${o.id}`}>
                <td className="px-4 py-2"><button onClick={() => navigate(`/admin/orders/${o.id}`)} className="font-medium text-forest hover:underline" data-testid={`open-order-${o.id}`}>{o.order_number}</button><p className="text-xs text-slate-400">{new Date(o.created_at).toLocaleString()}</p></td>
                <td className="px-4 py-2">{o.customer_name}<p className="text-xs text-slate-400">{o.customer_phone}</p></td>
                <td className="px-4 py-2">{o.is_priority ? <span className="flex items-center gap-1 text-saffron"><Zap className="h-3 w-3" />ASAP</span> : (o.slot_label || "-")}</td>
                <td className="px-4 py-2">{inr(o.final_amount)}</td>
                <td className="px-4 py-2"><Badge variant="outline">{o.payment_method.toUpperCase()}</Badge><p className="text-xs capitalize text-slate-400">{o.payment_status}</p></td>
                <td className="px-4 py-2">
                  <select value={o.status} onChange={(e) => changeStatus(o.id, e.target.value)} data-testid={`status-select-${o.id}`} className="rounded-md border p-1 text-xs">
                    {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-slate-400">Customer: {o.customer_status}</p>
                </td>
                <td className="px-4 py-2">
                  {!o.accepted && o.status === "pending" && <Button size="sm" className="bg-forest hover:bg-forest-dark" onClick={() => accept(o.id)} data-testid={`accept-${o.id}`}><Check className="mr-1 h-3 w-3" />Accept</Button>}
                </td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan="7" className="px-4 py-6 text-center text-slate-400">No orders</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
