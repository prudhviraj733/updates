import { useEffect, useState } from "react";
import api, { inr } from "@/lib/api";

export default function AdminAbandonedCarts() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/admin/analytics/carts").then(({ data }) => setData(data)); }, []);
  if (!data) return <p className="text-slate-400">Loading…</p>;

  return (
    <div data-testid="admin-abandoned-carts">
      <h1 className="text-2xl font-bold">Cart &amp; Abandonment</h1>
      <p className="text-sm text-slate-500">Live carts and abandoned-cart recovery opportunities</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-white p-4"><p className="text-xs uppercase text-slate-400">Active Carts</p><p className="mt-1 text-2xl font-bold">{data.active_carts}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs uppercase text-slate-400">Cart Value</p><p className="mt-1 text-2xl font-bold text-forest">{inr(data.cart_value_total)}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs uppercase text-slate-400">Abandoned Carts</p><p className="mt-1 text-2xl font-bold text-red-500">{data.abandoned_carts}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs uppercase text-slate-400">Abandoned Value</p><p className="mt-1 text-2xl font-bold text-red-500">{inr(data.abandoned_value)}</p></div>
      </div>

      <h2 className="mt-8 font-semibold">Most abandoned / in-cart products</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Product</th><th className="p-3">Qty sitting in carts</th></tr></thead>
          <tbody>
            {data.in_cart_products.map((p) => (<tr key={p.product_id} className="border-t" data-testid={`cart-prod-${p.product_id}`}><td className="p-3 font-medium">{p.name}</td><td className="p-3">{p.qty}</td></tr>))}
            {data.in_cart_products.length === 0 && <tr><td colSpan={2} className="p-6 text-center text-slate-400">No products in carts</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
