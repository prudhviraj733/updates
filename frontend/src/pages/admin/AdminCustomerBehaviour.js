import { useEffect, useState } from "react";
import api, { inr } from "@/lib/api";

export default function AdminCustomerBehaviour() {
  const [prod, setProd] = useState(null);
  const [refs, setRefs] = useState(null);
  useEffect(() => {
    api.get("/admin/analytics/products").then(({ data }) => setProd(data));
    api.get("/admin/analytics/referrals").then(({ data }) => setRefs(data));
  }, []);

  return (
    <div data-testid="admin-customer-behaviour">
      <h1 className="text-2xl font-bold">Customer Behaviour</h1>
      <p className="text-sm text-slate-500">Aggregate purchase behaviour across all customers</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white">
          <div className="border-b p-3 text-sm font-semibold">Most purchased products</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Product</th><th className="p-3">Units</th><th className="p-3">Revenue</th></tr></thead>
            <tbody>{(prod?.top_products || []).map((p) => <tr key={p.product_id} className="border-t"><td className="p-3">{p.name}</td><td className="p-3">{p.qty}</td><td className="p-3">{inr(p.revenue)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="rounded-xl border bg-white">
          <div className="border-b p-3 text-sm font-semibold">Top categories</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Category</th><th className="p-3">Units</th><th className="p-3">Revenue</th></tr></thead>
            <tbody>{(prod?.by_category || []).map((c) => <tr key={c.id} className="border-t"><td className="p-3">{c.name}</td><td className="p-3">{c.qty}</td><td className="p-3">{inr(c.revenue)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-white">
        <div className="border-b p-3 text-sm font-semibold">Top referrers ({refs?.total_referrals || 0} total referrals · {inr(refs?.total_reward_paid || 0)} rewards)</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Customer</th><th className="p-3">Referrals</th><th className="p-3">Reward earned</th></tr></thead>
          <tbody>{(refs?.top_referrers || []).map((r) => <tr key={r.referrer_id} className="border-t"><td className="p-3">{r.name}</td><td className="p-3">{r.count}</td><td className="p-3">{inr(r.reward)}</td></tr>)}
            {(!refs?.top_referrers?.length) && <tr><td colSpan={3} className="p-6 text-center text-slate-400">No referrals yet</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}
