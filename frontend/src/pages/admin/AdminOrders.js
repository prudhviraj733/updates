import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

const STATUSES = ["pending", "confirmed", "preparing", "ready_for_delivery", "out_for_delivery", "delivered", "cancelled"];
const label = (s) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(null);

  const load = () => { const q = filter ? `?status=${filter}` : ""; api.get(`/admin/orders${q}`).then(({ data }) => setOrders(data)); };
  useEffect(() => { load(); }, [filter]);

  const changeStatus = async (id, status) => {
    try { await api.put(`/admin/orders/${id}/status`, { status }); toast.success("Status updated"); load(); if (selected?.id === id) setSelected({ ...selected, status }); }
    catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Orders</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => setFilter("")} className={`rounded-full border px-3 py-1 text-sm ${!filter ? "border-forest bg-forest text-white" : ""}`}>All</button>
        {STATUSES.map((s) => <button key={s} onClick={() => setFilter(s)} data-testid={`filter-${s}`} className={`rounded-full border px-3 py-1 text-sm ${filter === s ? "border-forest bg-forest text-white" : ""}`}>{label(s)}</button>)}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Order</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Delivery</th><th className="px-4 py-2">Amount</th><th className="px-4 py-2">Payment</th><th className="px-4 py-2">Status</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t align-top" data-testid={`admin-order-${o.id}`}>
                <td className="px-4 py-2"><button onClick={() => setSelected(o)} className="font-medium text-forest hover:underline">{o.order_number}</button><p className="text-xs text-slate-400">{new Date(o.created_at).toLocaleString()}</p></td>
                <td className="px-4 py-2">{o.customer_name}<p className="text-xs text-slate-400">{o.customer_phone}</p></td>
                <td className="px-4 py-2">{o.is_priority ? <span className="flex items-center gap-1 text-saffron"><Zap className="h-3 w-3" />ASAP</span> : (o.slot_label || "-")}</td>
                <td className="px-4 py-2">{inr(o.final_amount)}</td>
                <td className="px-4 py-2"><Badge variant="outline">{o.payment_method.toUpperCase()}</Badge><p className="text-xs capitalize text-slate-400">{o.payment_status}</p></td>
                <td className="px-4 py-2">
                  <select value={o.status} onChange={(e) => changeStatus(o.id, e.target.value)} data-testid={`status-select-${o.id}`} className="rounded-md border p-1 text-xs">
                    {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan="6" className="px-4 py-6 text-center text-slate-400">No orders</td></tr>}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{selected.order_number}</h2>
            <p className="text-sm text-slate-500">{selected.customer_name} · {selected.customer_phone}</p>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">{selected.address?.line1}, {selected.address?.city} - {selected.address?.pincode}</div>
            <div className="mt-3 divide-y">
              {selected.items.map((i) => <div key={i.product_id} className="flex justify-between py-2 text-sm"><span>{i.name} × {i.quantity}</span><span>{inr(i.line_total)}</span></div>)}
            </div>
            <div className="mt-3 flex justify-between border-t pt-3 font-bold"><span>Total</span><span>{inr(selected.final_amount)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
