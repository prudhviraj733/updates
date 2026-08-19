import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShoppingBag, IndianRupee, TrendingUp, Tag, Truck, RotateCcw, AlertTriangle,
  MapPin, Users, Ticket, Share2, Wallet, ArrowRight, Package,
} from "lucide-react";
import api, { inr } from "@/lib/api";

const label = (s) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const STATUS_META = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  accepted: "bg-blue-50 text-blue-700 border-blue-200",
  confirmed: "bg-sky-50 text-sky-700 border-sky-200",
  preparing: "bg-indigo-50 text-indigo-700 border-indigo-200",
  ready_for_delivery: "bg-violet-50 text-violet-700 border-violet-200",
  out_for_delivery: "bg-purple-50 text-purple-700 border-purple-200",
  delivered: "bg-forest-light text-forest border-forest/20",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

function Section({ title, link, linkLabel, children, testid }) {
  return (
    <div className="rounded-2xl border bg-white p-5" data-testid={testid}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {link && <Link to={link} className="flex items-center gap-1 text-xs font-medium text-forest hover:underline">{linkLabel || "View"}<ArrowRight className="h-3 w-3" /></Link>}
      </div>
      {children}
    </div>
  );
}

export default function AdminDashboard() {
  const [d, setD] = useState(null);
  const navigate = useNavigate();
  useEffect(() => { api.get("/admin/dashboard/overview").then(({ data }) => setD(data)).catch(() => setD(false)); }, []);

  if (d === null) return <p className="text-slate-400">Loading…</p>;
  if (d === false) return <p className="text-red-500">Failed to load dashboard.</p>;

  const t = d.today_summary, tr = d.sales_trend, inv = d.inventory_alerts, cm = d.customer_marketing, fin = d.financial_snapshot;

  const todayCards = [
    { label: "Orders Today", value: t.orders, icon: ShoppingBag, c: "bg-blue-50 text-blue-600" },
    { label: "Sales Today", value: inr(t.sales), icon: IndianRupee, c: "bg-forest-light text-forest" },
    { label: "Profit Today", value: inr(t.profit), icon: TrendingUp, c: "bg-emerald-50 text-emerald-600" },
    { label: "Discounts Today", value: inr(t.discounts), icon: Tag, c: "bg-amber-50 text-amber-600" },
    { label: "Delivery Collected", value: inr(t.delivery_collected), icon: Truck, c: "bg-purple-50 text-purple-600" },
    { label: "Refunds Today", value: inr(t.refunds), icon: RotateCcw, c: "bg-red-50 text-red-600" },
  ];

  const marketing = [
    { label: "New Customers (Today)", value: cm.new_customers_today, to: "/admin/customers", icon: Users },
    { label: "New Customers (7d)", value: cm.new_customers_7d, to: "/admin/customers", icon: Users },
    { label: "Cart Abandonment", value: cm.cart_abandonment, to: "/admin/abandoned-carts", icon: ShoppingBag },
    { label: "Stopped Buying (30d+)", value: cm.stopped_buying, to: "/admin/customer-behaviour", icon: AlertTriangle },
    { label: "Coupon Usage", value: cm.coupon_usage, to: "/admin/coupons", icon: Ticket },
    { label: "Referral Customers", value: cm.referral_customers, to: "/admin/referrals", icon: Share2 },
  ];

  const finRows = [
    { label: "Gross Sales", value: fin.gross_sales },
    { label: "Product Discounts", value: fin.product_discounts, neg: true },
    { label: "Coupon Discounts", value: fin.coupon_discounts, neg: true },
    { label: "Delivery Revenue", value: fin.delivery_revenue },
    { label: "Refunds", value: fin.refunds, neg: true },
    { label: "Wallet Credits", value: fin.wallet_credits },
    { label: "Wallet Debits", value: fin.wallet_debits, neg: true },
    { label: "Referral Reward Cost", value: fin.referral_reward_cost, neg: true },
  ];

  return (
    <div data-testid="admin-dashboard">
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="text-sm text-slate-500">Quick business overview — real-time from your data</p>

      {/* 1. Today's Summary */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6" data-testid="today-summary">
        {todayCards.map((c) => (
          <div key={c.label} className="rounded-2xl border bg-white p-4" data-testid={`today-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
            <div className={`grid h-9 w-9 place-items-center rounded-lg ${c.c}`}><c.icon className="h-4 w-4" /></div>
            <p className="mt-2 text-lg font-bold text-slate-900">{c.value}</p>
            <p className="text-xs text-slate-500">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* 2. Live Orders */}
        <Section title="Live Orders" link="/admin/orders" linkLabel="All orders" testid="live-orders">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(d.live_orders).map(([s, n]) => (
              <button key={s} onClick={() => navigate(`/admin/orders?status=${s}`)} data-testid={`live-status-${s}`}
                className={`rounded-xl border px-3 py-3 text-left transition hover:shadow-sm ${STATUS_META[s] || "bg-slate-50"}`}>
                <p className="text-xl font-bold">{n}</p>
                <p className="text-xs font-medium">{label(s)}</p>
              </button>
            ))}
          </div>
        </Section>

        {/* 3. Sales Trend */}
        <Section title="Sales Trend" link="/admin/analytics" linkLabel="Full analytics" testid="sales-trend">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[["Today", tr.today], ["7 Days", tr.last_7_days], ["30 Days", tr.last_30_days]].map(([lbl, w]) => (
              <div key={lbl} className="rounded-xl bg-slate-50 p-3" data-testid={`trend-${lbl.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                <p className="text-xs font-semibold text-slate-500">{lbl}</p>
                <p className="mt-1 text-base font-bold text-slate-900">{w.orders}</p>
                <p className="text-[11px] text-slate-400">orders</p>
                <p className="mt-1 text-sm font-semibold text-forest">{inr(w.revenue)}</p>
                <p className="text-[11px] text-emerald-600">Profit {inr(w.profit)}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* 4. Inventory Alerts */}
        <Section title="Inventory Alerts" link="/admin/inventory" linkLabel="Manage inventory" testid="inventory-alerts">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xl font-bold text-amber-700">{inv.low_stock}</p><p className="text-xs text-amber-700">Low stock items</p></div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-3"><p className="text-xl font-bold text-red-700">{inv.out_of_stock}</p><p className="text-xs text-red-700">Out of stock items</p></div>
          </div>
          {inv.pin_issues.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-slate-500">PIN-wise stock issues</p>
              <ul className="space-y-1">
                {inv.pin_issues.map((p) => (
                  <li key={p.pincode} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                    <span className="font-medium">{p.pincode}</span>
                    <span className="text-slate-500">{p.out} out · {p.low} low</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {/* 6. Customer & Marketing */}
        <Section title="Customer & Marketing" testid="customer-marketing">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {marketing.map((m) => (
              <Link key={m.label} to={m.to} data-testid={`cm-${m.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className="rounded-xl border bg-slate-50 px-3 py-3 transition hover:shadow-sm">
                <m.icon className="h-4 w-4 text-slate-400" />
                <p className="mt-1 text-lg font-bold text-slate-900">{m.value}</p>
                <p className="text-[11px] text-slate-500">{m.label}</p>
              </Link>
            ))}
          </div>
        </Section>
      </div>

      {/* 5. PIN Code Performance */}
      <div className="mt-4">
      <Section title="PIN Code Performance" link="/admin/delivery-stats" linkLabel="PIN statistics" testid="pin-performance">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-2"><MapPin className="inline h-3 w-3" /> PIN</th><th className="py-2">Orders</th><th className="py-2">Sales</th><th className="py-2">Customers</th><th className="py-2">Delivery</th></tr></thead>
            <tbody>
              {d.pin_performance.map((p) => (
                <tr key={p.pincode} className="border-t" data-testid={`pinperf-${p.pincode}`}>
                  <td className="py-2 font-medium">{p.pincode === "—" ? "Unattributed (legacy)" : p.pincode}</td>
                  <td className="py-2">{p.orders}</td>
                  <td className="py-2 font-semibold text-forest">{inr(p.sales)}</td>
                  <td className="py-2">{p.customers}</td>
                  <td className="py-2">{inr(p.delivery)}</td>
                </tr>
              ))}
              {d.pin_performance.length === 0 && <tr><td colSpan="5" className="py-4 text-center text-slate-400">No orders yet</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* 7. Financial Snapshot */}
        <Section title="Financial Snapshot" link="/admin/analytics" linkLabel="Detailed report" testid="financial-snapshot">
          <div className="space-y-1.5 text-sm">
            {finRows.map((r) => (
              <div key={r.label} className="flex justify-between">
                <span className="text-slate-500">{r.label}</span>
                <span className={r.neg && r.value > 0 ? "text-red-600" : "text-slate-800"}>{r.neg && r.value > 0 ? "-" : ""}{inr(r.value)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold">
              <span className="flex items-center gap-1"><Wallet className="h-4 w-4 text-forest" />Estimated Profit</span>
              <span className="text-forest">{inr(fin.estimated_profit)}</span>
            </div>
          </div>
        </Section>

        {/* Recent Orders */}
        <Section title="Recent Orders" link="/admin/orders" linkLabel="All orders" testid="recent-orders">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-2">Order</th><th className="py-2">Amount</th><th className="py-2">PIN</th><th className="py-2">Status</th></tr></thead>
            <tbody>
              {d.recent_orders.map((o) => (
                <tr key={o.id} className="border-t"><td className="py-2 font-medium">{o.order_number}</td><td className="py-2">{inr(o.final_amount)}</td><td className="py-2 text-slate-500">{o.pincode || "—"}</td><td className="py-2">{label(o.status)}</td></tr>
              ))}
              {d.recent_orders.length === 0 && <tr><td colSpan="4" className="py-4 text-center text-slate-400">No orders yet</td></tr>}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}
