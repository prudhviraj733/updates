import { useEffect, useState } from "react";
import api, { inr } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

export default function AdminDeliveryStats() {
  const [pins, setPins] = useState([]);
  useEffect(() => { api.get("/admin/analytics/pin-stats").then(({ data }) => setPins(data.pins)); }, []);

  const totals = pins.reduce((a, p) => ({ orders: a.orders + p.orders, sales: a.sales + p.sales, express: a.express + p.express_orders }), { orders: 0, sales: 0, express: 0 });

  return (
    <div data-testid="admin-delivery-stats">
      <h1 className="text-2xl font-bold">PIN-wise Delivery Stats</h1>
      <p className="text-sm text-slate-500">Orders, sales, AOV and customers by delivery PIN code</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4"><p className="text-xs uppercase text-slate-400">Total Orders</p><p className="mt-1 text-2xl font-bold">{totals.orders}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs uppercase text-slate-400">Total Sales</p><p className="mt-1 text-2xl font-bold text-forest">{inr(totals.sales)}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs uppercase text-slate-400">30-Min Orders</p><p className="mt-1 text-2xl font-bold text-saffron">{totals.express}</p></div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">PIN</th><th className="p-3">Orders</th><th className="p-3">Sales</th><th className="p-3">AOV</th><th className="p-3">Customers</th><th className="p-3">30-Min</th><th className="p-3">Serviceable</th></tr></thead>
          <tbody>
            {pins.map((p) => (
              <tr key={p.pincode} className="border-t" data-testid={`pin-stat-${p.pincode}`}>
                <td className="p-3 font-medium">{p.pincode}</td>
                <td className="p-3">{p.orders}</td>
                <td className="p-3">{inr(p.sales)}</td>
                <td className="p-3">{inr(p.aov)}</td>
                <td className="p-3">{p.customers}</td>
                <td className="p-3">{p.express_orders}</td>
                <td className="p-3">{p.serviceable === true ? <Badge className="bg-forest-light text-forest">Yes</Badge> : p.serviceable === false ? <Badge variant="secondary">No</Badge> : <span className="text-slate-400">Unlisted</span>}</td>
              </tr>
            ))}
            {pins.length === 0 && <tr><td colSpan="7" className="p-6 text-center text-slate-400">No delivery data yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
