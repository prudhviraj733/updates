import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, MousePointerClick, CheckCircle2, ShoppingBag } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const RANGES = [
  { k: "today", label: "Today" },
  { k: "7d", label: "7 days" },
  { k: "30d", label: "30 days" },
  { k: "month", label: "This month" },
  { k: "all", label: "All time" },
];

function Metric({ label, value, sub }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
      {sub != null && <p className="mt-1 text-xs font-medium text-forest">{sub}</p>}
    </div>
  );
}

function FunnelStep({ icon: Icon, label, value, rate }) {
  return (
    <div className="flex-1 rounded-xl border bg-white p-4 text-center">
      <Icon className="mx-auto h-5 w-5 text-forest" />
      <p className="mt-2 text-xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
      {rate != null && <p className="mt-1 text-xs font-semibold text-slate-500">{rate}%</p>}
    </div>
  );
}

export default function AdminCouponStats() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [range, setRange] = useState("30d");
  const [stats, setStats] = useState(null);
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    api.get(`/admin/coupons/${id}/stats?range=${range}`).then(({ data }) => setStats(data)).catch(() => {});
    api.get(`/admin/coupons/${id}/usage?range=${range}`).then(({ data }) => setUsage(data)).catch(() => {});
  }, [id, range]);

  if (!stats) return <div className="p-6 text-slate-500" data-testid="coupon-stats-loading">Loading analytics…</div>;
  const c = stats.coupon;
  const f = stats.funnel;
  const cv = stats.conversion;
  const t = stats.totals;
  const isPrivate = (c.visibility || "public") === "private";

  return (
    <div data-testid="admin-coupon-stats">
      <button onClick={() => navigate("/admin/coupons")} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-forest" data-testid="back-to-coupons"><ArrowLeft className="h-4 w-4" />Back to coupons</button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-forest">{c.code}</h1>
          <Badge className={isPrivate ? "bg-slate-200 text-slate-700" : "bg-green-100 text-green-700"}>{isPrivate ? "Private" : "Public"}</Badge>
          {c.first_order_only && <Badge className="bg-orange-100 text-orange-700">First order</Badge>}
          {c.category_name && <Badge className="bg-amber-100 text-amber-700">{c.category_name} only</Badge>}
        </div>
        <div className="flex gap-1" data-testid="stats-range">
          {RANGES.map((r) => (
            <button key={r.k} onClick={() => setRange(r.k)} data-testid={`range-${r.k}`} className={`rounded-full px-3 py-1 text-xs font-medium ${range === r.k ? "bg-forest text-white" : "border hover:bg-slate-50"}`}>{r.label}</button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {c.discount_type === "percentage" ? `${c.discount_value}% off` : `${inr(c.discount_value)} off`}
        {c.max_discount ? ` (max ${inr(c.max_discount)})` : ""} · Min order {inr(c.min_order_value)}
        {isPrivate && ` · Targeted to ${c.target_user_count} customer(s)`}
      </p>

      {/* Funnel */}
      <h2 className="mt-6 text-sm font-semibold text-slate-500">
        {isPrivate ? "Private coupon funnel" : "Public funnel: Viewed → Applied → Validated → Redeemed"}
      </h2>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row" data-testid="coupon-funnel">
        {!isPrivate && <FunnelStep icon={Eye} label="Views" value={f.views} />}
        <FunnelStep icon={MousePointerClick} label="Apply attempts" value={f.apply_attempts} rate={!isPrivate ? cv.view_to_apply : null} />
        <FunnelStep icon={CheckCircle2} label="Validated" value={f.successful_applications} rate={cv.apply_success_rate} />
        <FunnelStep icon={ShoppingBag} label="Redemptions" value={f.redemptions} rate={cv.apply_to_redeem} />
      </div>

      {/* Metrics */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="coupon-metrics">
        <Metric label="Total discount given" value={inr(t.total_discount)} />
        <Metric label="Revenue generated" value={inr(t.total_order_value)} />
        <Metric label="Avg order value" value={inr(t.avg_order_value)} />
        <Metric label="Redemption rate" value={`${cv.redemption_rate}%`} sub={!isPrivate ? "of views" : "of applies"} />
        <Metric label="Unique customers" value={t.unique_customers} />
        <Metric label="First-time users" value={t.first_time_users} />
        <Metric label="Repeat users" value={t.repeat_users} />
        <Metric label="Customers attempted" value={t.customers_attempted} />
        <Metric label="Failed applications" value={f.failed_applications} />
        <Metric label="Usage limit" value={stats.usage_limit ?? "∞"} sub={stats.usage_percent != null ? `${stats.usage_percent}% used` : null} />
        <Metric label="Remaining uses" value={stats.remaining ?? "∞"} />
        <Metric label="Successful redemptions" value={f.redemptions} />
      </div>

      {/* Usage history */}
      <h2 className="mt-8 text-lg font-bold">Usage history <span className="text-sm font-normal text-slate-400">({usage?.count || 0} orders · admin only)</span></h2>
      <div className="mt-3 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm" data-testid="coupon-usage-table">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="p-3">Customer</th><th className="p-3">Order ID</th><th className="p-3">Date</th>
              <th className="p-3">Order value</th><th className="p-3">Discount</th><th className="p-3">Final</th>
              <th className="p-3">Type</th><th className="p-3">Payment</th><th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(usage?.usage || []).map((u) => (
              <tr key={u.order_id} className="border-t" data-testid={`usage-row-${u.order_id}`}>
                <td className="p-3"><div className="font-medium text-slate-700">{u.customer}</div><div className="text-xs text-slate-400">{u.customer_id}</div></td>
                <td className="p-3 font-mono text-xs">{u.order_id?.slice(-8)}</td>
                <td className="p-3 text-slate-500">{(u.created_at || "").slice(0, 16).replace("T", " ")}</td>
                <td className="p-3">{inr(u.order_value)}</td>
                <td className="p-3 text-forest">-{inr(u.discount)}</td>
                <td className="p-3 font-medium">{inr(u.final_amount)}</td>
                <td className="p-3"><Badge variant="secondary">{u.coupon_type}</Badge></td>
                <td className="p-3 text-xs text-slate-500">{u.payment_method || "—"}<div>{u.payment_status || ""}</div></td>
                <td className="p-3"><Badge variant="secondary">{u.status}</Badge></td>
              </tr>
            ))}
            {(!usage?.usage || usage.usage.length === 0) && (
              <tr><td colSpan={9} className="p-8 text-center text-slate-400">No redemptions in this period yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
