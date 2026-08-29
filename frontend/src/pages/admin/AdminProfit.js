import { useEffect, useState } from "react";
import { TrendingUp, IndianRupee, Percent, Package, Ticket, Boxes } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const PERIODS = [
  { v: "today", label: "Today" },
  { v: "yesterday", label: "Yesterday" },
  { v: "week", label: "This Week" },
  { v: "month", label: "This Month" },
  { v: "prev_month", label: "Previous Month" },
  { v: "custom", label: "Custom" },
];
const TABS = [
  { v: "overview", label: "Overview", icon: TrendingUp },
  { v: "products", label: "Products & Categories", icon: Package },
  { v: "coupons", label: "Coupon Impact", icon: Ticket },
  { v: "inventory", label: "Inventory Value", icon: Boxes },
];

const Card = ({ label, value, sub, accent, testid }) => (
  <div className="rounded-xl border bg-white p-4" data-testid={testid}>
    <p className="text-xs text-slate-400">{label}</p>
    <p className={`mt-1 text-xl font-bold ${accent || "text-slate-800"}`}>{value}</p>
    {sub != null && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
  </div>
);

export default function AdminProfit() {
  const [period, setPeriod] = useState("month");
  const [range, setRange] = useState({ start: "", end: "" });
  const [tab, setTab] = useState("overview");
  const [summary, setSummary] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [coupons, setCoupons] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const qs = () => {
    let s = `period=${period}`;
    if (period === "custom" && range.start && range.end) s += `&start=${range.start}&end=${range.end}`;
    return s;
  };

  const customIncomplete = period === "custom" && (!range.start || !range.end);

  const load = async () => {
    if (customIncomplete) { setSummary(null); setBreakdown(null); setCoupons(null); return; }
    setLoading(true); setError(false);
    try {
      const [s, b, c] = await Promise.all([
        api.get(`/admin/profit/summary?${qs()}`),
        api.get(`/admin/profit/breakdown?${qs()}`),
        api.get(`/admin/profit/coupons?${qs()}`),
      ]);
      setSummary(s.data); setBreakdown(b.data); setCoupons(c.data);
    } catch { setError(true); } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period, range.start, range.end]);
  useEffect(() => { api.get("/admin/profit/inventory").then(({ data }) => setInventory(data)).catch(() => {}); }, []);

  const r = summary?.realized;
  const daily = (summary?.daily || []).map((d) => ({
    date: d.date.slice(5), Sales: d.gross_sales, "Net Revenue": d.net_revenue, Profit: d.net_profit, Margin: d.margin_pct,
  }));

  return (
    <div data-testid="admin-profit">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Profit &amp; Margins</h1>
          <p className="text-sm text-slate-500">Order-level profit across sales, discounts, delivery &amp; refunds</p>
        </div>
        <Badge className="bg-forest-light text-forest">{summary?.period}{summary ? ` · ${summary.start} → ${summary.end}` : ""}</Badge>
      </div>

      {/* Period selector */}
      <div className="mt-4 flex flex-wrap items-end gap-2">
        {PERIODS.map((p) => (
          <Button key={p.v} size="sm" variant={period === p.v ? "default" : "outline"}
            className={period === p.v ? "bg-forest hover:bg-forest-dark" : ""}
            onClick={() => setPeriod(p.v)} data-testid={`period-${p.v}`}>{p.label}</Button>
        ))}
        {period === "custom" && (
          <div className="flex items-end gap-2">
            <div><Label className="text-xs">From</Label><Input type="date" className="h-9" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} data-testid="profit-start" /></div>
            <div><Label className="text-xs">To</Label><Input type="date" className="h-9" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} data-testid="profit-end" /></div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-5 flex flex-wrap gap-2 border-b">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)} data-testid={`tab-${t.v}`}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === t.v ? "border-forest text-forest" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {loading && <p className="mt-4 text-sm text-slate-400">Loading…</p>}
      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" data-testid="profit-error">
          Couldn't load profit data.
          <Button size="sm" variant="outline" onClick={load} data-testid="profit-retry">Retry</Button>
        </div>
      )}
      {customIncomplete && (
        <p className="mt-4 text-sm text-slate-500" data-testid="custom-prompt">Pick a start and end date to see profit for a custom range.</p>
      )}

      {/* ---------------- Overview ---------------- */}
      {tab === "overview" && r && (
        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Card testid="kpi-orders" label="Completed Orders" value={r.orders} accent="text-forest" />
            <Card testid="kpi-sales" label="Total Sales (MRP)" value={inr(r.gross_sales)} />
            <Card testid="kpi-net-revenue" label="Net Revenue" value={inr(r.net_revenue)} />
            <Card testid="kpi-cost" label="Purchase Cost" value={inr(r.purchase_cost)} accent="text-amber-600" />
            <Card testid="kpi-net-profit" label="Net Profit" value={inr(r.net_profit)} accent={r.net_profit >= 0 ? "text-forest" : "text-red-600"} />
            <Card testid="kpi-margin" label="Profit Margin" value={`${r.margin_pct}%`} accent="text-forest" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Card testid="kpi-product-disc" label="Product Discounts" value={inr(r.product_discount)} accent="text-slate-600" />
            <Card testid="kpi-coupon-disc" label="Coupon Discounts" value={inr(r.coupon_discount)} accent="text-slate-600" />
            <Card testid="kpi-gross-profit" label="Gross Profit" value={inr(r.gross_profit)} />
            <Card testid="kpi-del-collected" label="Delivery Collected" value={inr(r.delivery_collected)} />
            <Card testid="kpi-del-cost" label="Delivery Cost" value={inr(r.delivery_cost)} accent="text-amber-600" />
            <Card testid="kpi-refunds" label="Refunds" value={inr(r.refunds)} accent="text-red-600" />
          </div>

          {summary.in_progress?.orders > 0 && (
            <p className="text-xs text-slate-400" data-testid="in-progress-note">
              {summary.in_progress.orders} in-progress order(s) worth {inr(summary.in_progress.net_profit)} projected profit not yet realized · {summary.cancelled_orders} cancelled excluded.
            </p>
          )}

          {/* Daily chart */}
          <div className="rounded-xl border bg-white p-4">
            <p className="mb-3 text-sm font-semibold">Daily Sales vs Profit</p>
            {daily.length === 0 ? <p className="text-sm text-slate-400">No completed orders in this period.</p> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} />
                  <Tooltip formatter={(v, n) => n === "Margin" ? `${v}%` : inr(v)} />
                  <Legend />
                  <Bar dataKey="Net Revenue" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Profit" fill="#1B4332" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Daily margin line */}
          {daily.length > 1 && (
            <div className="rounded-xl border bg-white p-4">
              <p className="mb-3 text-sm font-semibold">Daily Profit Margin %</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} unit="%" />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Line type="monotone" dataKey="Margin" stroke="#1B4332" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Daily table */}
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm" data-testid="daily-table">
              <thead className="bg-slate-50 text-left text-slate-500"><tr>
                <th className="px-4 py-2">Date</th><th className="px-4 py-2">Orders</th><th className="px-4 py-2">Sales</th>
                <th className="px-4 py-2">Net Revenue</th><th className="px-4 py-2">Profit</th><th className="px-4 py-2">Margin</th>
              </tr></thead>
              <tbody>
                {summary.daily.map((d) => (
                  <tr key={d.date} className="border-t">
                    <td className="px-4 py-2">{d.date}</td><td className="px-4 py-2">{d.orders}</td>
                    <td className="px-4 py-2">{inr(d.gross_sales)}</td><td className="px-4 py-2">{inr(d.net_revenue)}</td>
                    <td className="px-4 py-2 font-semibold text-forest">{inr(d.net_profit)}</td><td className="px-4 py-2">{d.margin_pct}%</td>
                  </tr>
                ))}
                {summary.daily.length === 0 && <tr><td colSpan="6" className="px-4 py-6 text-center text-slate-400">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- Products & Categories ---------------- */}
      {tab === "products" && breakdown && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-slate-400" data-testid="breakdown-note">Business-analysis view: revenue/profit here are gross per-item (selling price − cost price, before coupons and inclusive-GST adjustments), so these margins differ from the order-level net margin on the Overview tab.</p>
          <div className="grid gap-5 lg:grid-cols-2">
          <BreakdownTable title="By Product" rows={breakdown.by_product} testid="bd-products" />
          <BreakdownTable title="By Category" rows={breakdown.by_category} testid="bd-categories" />
          <BreakdownTable title="By Subcategory" rows={breakdown.by_subcategory} testid="bd-subcategories" />
          <BreakdownTable title="By Sub-subcategory" rows={breakdown.by_subsubcategory} testid="bd-subsubcategories" />
          </div>
        </div>
      )}

      {/* ---------------- Coupons ---------------- */}
      {tab === "coupons" && coupons && (
        <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm" data-testid="coupon-profit-table">
            <thead className="bg-slate-50 text-left text-slate-500"><tr>
              <th className="px-4 py-2">Coupon</th><th className="px-4 py-2">Visibility</th><th className="px-4 py-2">Orders</th>
              <th className="px-4 py-2">Discount Given</th><th className="px-4 py-2">Net Revenue</th><th className="px-4 py-2">Profit</th><th className="px-4 py-2">Margin</th>
            </tr></thead>
            <tbody>
              {coupons.coupons.map((c) => (
                <tr key={c.code} className="border-t">
                  <td className="px-4 py-2 font-mono">{c.code}</td>
                  <td className="px-4 py-2"><Badge variant="secondary" className="capitalize">{c.visibility}</Badge></td>
                  <td className="px-4 py-2">{c.orders}</td>
                  <td className="px-4 py-2 text-red-600">- {inr(c.discount)}</td>
                  <td className="px-4 py-2">{inr(c.revenue)}</td>
                  <td className="px-4 py-2 font-semibold text-forest">{inr(c.profit)}</td>
                  <td className="px-4 py-2">{c.margin_pct}%</td>
                </tr>
              ))}
              {coupons.coupons.length === 0 && <tr><td colSpan="7" className="px-4 py-6 text-center text-slate-400">No coupon-based orders in this period</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------- Inventory value ---------------- */}
      {tab === "inventory" && inventory && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Card testid="inv-products" label="Stock rows" value={inventory.totals.products} />
            <Card testid="inv-units" label="Units" value={inventory.totals.units} />
            <Card testid="inv-value" label="Value at Cost" value={inr(inventory.totals.inventory_value_at_cost)} accent="text-amber-600" />
            <Card testid="inv-sales" label="Potential Sales Value" value={inr(inventory.totals.potential_sales_value)} />
            <Card testid="inv-profit" label="Potential Gross Profit" value={inr(inventory.totals.potential_gross_profit)} sub={`${inventory.totals.potential_margin_pct}% margin`} accent="text-forest" />
          </div>
          <p className="text-xs text-slate-400">Uses batch purchase price where recorded, otherwise the product cost price. This is a business-analysis view and never affects order-level profit.</p>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm" data-testid="inventory-value-table">
              <thead className="bg-slate-50 text-left text-slate-500"><tr>
                <th className="px-4 py-2">Product</th><th className="px-4 py-2">PIN</th><th className="px-4 py-2">Stock</th>
                <th className="px-4 py-2">Avg Cost</th><th className="px-4 py-2">Value at Cost</th><th className="px-4 py-2">Potential Sales</th><th className="px-4 py-2">Potential Profit</th>
              </tr></thead>
              <tbody>
                {inventory.items.map((it, i) => (
                  <tr key={`${it.product_id}-${it.pincode}-${i}`} className="border-t">
                    <td className="px-4 py-2"><p className="font-medium">{it.product_name}</p><p className="text-xs text-slate-400">{it.sku}</p></td>
                    <td className="px-4 py-2">{it.pincode || "—"}</td>
                    <td className="px-4 py-2">{it.available}</td>
                    <td className="px-4 py-2">{inr(it.avg_purchase_cost)}</td>
                    <td className="px-4 py-2">{inr(it.inventory_value_at_cost)}</td>
                    <td className="px-4 py-2">{inr(it.potential_sales_value)}</td>
                    <td className="px-4 py-2 font-semibold text-forest">{inr(it.potential_gross_profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const BreakdownTable = ({ title, rows, testid }) => (
  <div className="overflow-x-auto rounded-xl border bg-white" data-testid={testid}>
    <div className="border-b p-3 text-sm font-semibold">{title}</div>
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-left text-slate-500"><tr>
        <th className="px-3 py-2">Name</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Revenue</th><th className="px-3 py-2">Profit</th><th className="px-3 py-2">Margin</th>
      </tr></thead>
      <tbody>
        {rows.slice(0, 20).map((r) => (
          <tr key={r.id} className="border-t">
            <td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{r.qty}</td>
            <td className="px-3 py-2">{inr(r.revenue)}</td>
            <td className="px-3 py-2 font-medium text-forest">{inr(r.profit)}</td>
            <td className="px-3 py-2">{r.margin_pct}%</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan="5" className="px-3 py-6 text-center text-slate-400">No data</td></tr>}
      </tbody>
    </table>
  </div>
);
