import { useEffect, useState } from "react";
import { ShoppingBag, Package, Users, MapPin, IndianRupee, AlertTriangle, Clock } from "lucide-react";
import api, { inr } from "@/lib/api";

const CARDS = [
  { key: "total_orders", label: "Total Orders", icon: ShoppingBag, color: "bg-blue-50 text-blue-600" },
  { key: "total_revenue", label: "Revenue (Paid)", icon: IndianRupee, color: "bg-forest-light text-forest", money: true },
  { key: "total_products", label: "Active Products", icon: Package, color: "bg-purple-50 text-purple-600" },
  { key: "total_customers", label: "Customers", icon: Users, color: "bg-amber-50 text-amber-600" },
];

const label = (s) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get("/admin/dashboard/stats").then(({ data }) => setStats(data)); }, []);
  if (!stats) return <p>Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="text-sm text-slate-500">Overview of your grocery business</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((c) => (
          <div key={c.key} className="rounded-xl border bg-white p-5" data-testid={`stat-${c.key}`}>
            <div className={`grid h-10 w-10 place-items-center rounded-lg ${c.color}`}><c.icon className="h-5 w-5" /></div>
            <p className="mt-3 text-2xl font-bold text-slate-900">{c.money ? inr(stats[c.key]) : stats[c.key]}</p>
            <p className="text-sm text-slate-500">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-5"><div className="flex items-center gap-2 text-amber-600"><Clock className="h-4 w-4" /><span className="text-sm font-medium">Pending Orders</span></div><p className="mt-2 text-xl font-bold">{stats.pending_orders}</p></div>
        <div className="rounded-xl border bg-white p-5"><div className="flex items-center gap-2 text-orange-600"><AlertTriangle className="h-4 w-4" /><span className="text-sm font-medium">Low Stock</span></div><p className="mt-2 text-xl font-bold">{stats.low_stock}</p></div>
        <div className="rounded-xl border bg-white p-5"><div className="flex items-center gap-2 text-red-600"><AlertTriangle className="h-4 w-4" /><span className="text-sm font-medium">Out of Stock</span></div><p className="mt-2 text-xl font-bold">{stats.out_of_stock}</p></div>
      </div>

      <div className="mt-6 rounded-xl border bg-white">
        <div className="border-b px-5 py-3 font-semibold text-slate-900">Recent Orders</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-5 py-2">Order</th><th className="px-5 py-2">Customer</th><th className="px-5 py-2">Amount</th><th className="px-5 py-2">Status</th></tr></thead>
          <tbody>
            {stats.recent_orders.map((o) => (
              <tr key={o.id} className="border-t"><td className="px-5 py-2 font-medium">{o.order_number}</td><td className="px-5 py-2">{o.customer_name}</td><td className="px-5 py-2">{inr(o.final_amount)}</td><td className="px-5 py-2">{label(o.status)}</td></tr>
            ))}
            {stats.recent_orders.length === 0 && <tr><td colSpan="4" className="px-5 py-6 text-center text-slate-400">No orders yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
