import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TABS = [
  ["sales", "Sales"], ["products", "Product Analytics"], ["carts", "Cart & Abandonment"],
  ["profitability", "Profitability"], ["discounts", "Discounts"], ["coupons", "Coupon Analytics"],
  ["referrals", "Referral Analytics"], ["wallet", "Wallet Analytics"], ["payments", "Payment Analytics"],
  ["platform", "Website vs App"],
  ["reports", "Financial Reports"],
];

const Stat = ({ label, value, sub, accent }) => (
  <div className="rounded-xl border bg-white p-4" data-testid={`stat-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
    <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
    <p className={`mt-1 text-2xl font-bold ${accent || "text-slate-800"}`}>{value}</p>
    {sub && <p className="text-xs text-slate-400">{sub}</p>}
  </div>
);

function Table({ title, rows, cols }) {
  return (
    <div className="rounded-xl border bg-white">
      {title && <div className="border-b p-3 text-sm font-semibold">{title}</div>}
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-500"><tr>{cols.map((c) => <th key={c[0]} className="p-3">{c[1]}</th>)}</tr></thead>
        <tbody>
          {(rows || []).map((r, i) => <tr key={i} className="border-t">{cols.map((c) => <td key={c[0]} className="p-3">{c[2] ? c[2](r[c[0]]) : r[c[0]]}</td>)}</tr>)}
          {(!rows || rows.length === 0) && <tr><td colSpan={cols.length} className="p-6 text-center text-slate-400">No data yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminAnalytics() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "sales";
  const [ov, setOv] = useState(null);
  const [prod, setProd] = useState(null);
  const [carts, setCarts] = useState(null);
  const [coupons, setCoupons] = useState(null);
  const [payments, setPayments] = useState(null);
  const [referrals, setReferrals] = useState(null);
  const [walletA, setWalletA] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [prange, setPrange] = useState("30");
  const [pstart, setPstart] = useState("");
  const [pend, setPend] = useState("");
  const [expenses, setExpenses] = useState({ expenses: [], total: 0 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", category: "operations", amount: 0, notes: "" });

  const loadExpenses = () => api.get("/admin/expenses").then(({ data }) => setExpenses(data));
  useEffect(() => {
    api.get("/admin/analytics/overview").then(({ data }) => setOv(data));
    api.get("/admin/analytics/products").then(({ data }) => setProd(data));
    api.get("/admin/analytics/carts").then(({ data }) => setCarts(data));
    api.get("/admin/analytics/coupons").then(({ data }) => setCoupons(data));
    api.get("/admin/analytics/payments").then(({ data }) => setPayments(data));
    api.get("/admin/analytics/referrals").then(({ data }) => setReferrals(data));
    api.get("/admin/analytics/wallet").then(({ data }) => setWalletA(data));
    loadExpenses();
  }, []);

  const addExpense = async () => {
    try { await api.post("/admin/expenses", { ...form, amount: Number(form.amount) }); toast.success("Expense added"); setOpen(false); setForm({ title: "", category: "operations", amount: 0, notes: "" }); loadExpenses(); }
    catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };
  const delExpense = async (id) => { await api.delete(`/admin/expenses/${id}`); loadExpenses(); };

  useEffect(() => {
    if (tab !== "platform") return;
    let qs = "";
    if (prange === "custom") { if (pstart && pend) qs = `?start=${pstart}&end=${pend}`; }
    else qs = `?days=${prange === "today" ? 0 : prange}`;
    api.get(`/admin/analytics/platform${qs}`).then(({ data }) => setPlatform(data)).catch(() => {});
  }, [tab, prange, pstart, pend]);

  return (
    <div data-testid="admin-analytics">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Sales &amp; Analytics</h1><p className="text-sm text-slate-500">Financial Control Center</p></div>
        {(tab === "reports" || tab === "sales") && <Button className="bg-forest hover:bg-forest-dark" onClick={() => setOpen(true)} data-testid="add-expense-btn"><Plus className="mr-1 h-4 w-4" />Add Expense</Button>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setParams({ tab: k })} data-testid={`atab-${k}`} className={`rounded-full border px-3 py-1 text-sm ${tab === k ? "border-forest bg-forest text-white" : ""}`}>{l}</button>)}
      </div>

      <div className="mt-6">
        {tab === "sales" && ov && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Net Revenue" value={inr(ov.net_revenue)} sub={`${ov.orders_count} orders`} accent="text-forest" />
            <Stat label="Gross Sales" value={inr(ov.gross_sales)} />
            <Stat label="AOV" value={inr(ov.average_order_value)} />
            <Stat label="Cancelled" value={ov.cancelled_count} />
            <Stat label="Delivery Revenue" value={inr(ov.delivery_revenue)} />
            <Stat label="ASAP Revenue" value={inr(ov.asap_revenue)} accent="text-saffron" />
            <Stat label="Total Discounts" value={inr(ov.total_discount)} />
            <Stat label="Est. Profit" value={inr(ov.estimated_profit)} accent={ov.estimated_profit >= 0 ? "text-forest" : "text-red-500"} />
          </div>
        )}

        {tab === "products" && prod && <Table title="Top Products" rows={prod.top_products} cols={[["name", "Product"], ["qty", "Units"], ["revenue", "Revenue", inr], ["profit", "Profit", inr]]} />}

        {tab === "carts" && carts && (
          <div>
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label="Active Carts" value={carts.active_carts} />
              <Stat label="Cart Value" value={inr(carts.cart_value_total)} />
              <Stat label="Abandoned" value={carts.abandoned_carts} accent="text-red-500" />
              <Stat label="Abandoned Value" value={inr(carts.abandoned_value)} accent="text-red-500" />
            </div>
            <div className="mt-6"><Table title="Products in carts" rows={carts.in_cart_products} cols={[["name", "Product"], ["qty", "Qty"]]} /></div>
          </div>
        )}

        {tab === "profitability" && prod && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Table title="By Category" rows={prod.by_category} cols={[["name", "Category"], ["revenue", "Revenue", inr], ["profit", "Profit", inr]]} />
            <Table title="By Brand" rows={prod.by_brand} cols={[["name", "Brand"], ["revenue", "Revenue", inr], ["profit", "Profit", inr]]} />
          </div>
        )}

        {tab === "discounts" && ov && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Product Discounts" value={inr(ov.product_discount)} />
            <Stat label="Coupon Discounts" value={inr(ov.coupon_discount)} />
            <Stat label="Total Discounts" value={inr(ov.total_discount)} accent="text-red-500" />
          </div>
        )}

        {tab === "coupons" && coupons && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Table title="Coupon Usage" rows={coupons.coupon_usage} cols={[["code", "Code"], ["uses", "Uses"], ["discount", "Discount", inr], ["revenue", "Revenue", inr]]} />
            <div className="grid gap-4 sm:grid-cols-2 content-start">
              <Stat label="Personalized Issued" value={coupons.personalized_issued} />
              <Stat label="Personalized Redeemed" value={coupons.personalized_redeemed} />
            </div>
          </div>
        )}

        {tab === "referrals" && referrals && (
          <div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Total Referrals" value={referrals.total_referrals} />
              <Stat label="Reward Paid" value={inr(referrals.total_reward_paid)} accent="text-forest" />
              <Stat label="Customers w/ Codes" value={referrals.customers_with_codes} />
            </div>
            <div className="mt-6"><Table title="Top Referrers" rows={referrals.top_referrers} cols={[["name", "Customer"], ["count", "Referrals"], ["reward", "Reward", inr]]} /></div>
          </div>
        )}

        {tab === "wallet" && walletA && (
          <div>
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat label="Wallet Liability" value={inr(walletA.total_liability)} accent="text-forest" />
              <Stat label="Total Credited" value={inr(walletA.total_credited)} />
              <Stat label="Total Debited" value={inr(walletA.total_debited)} />
              <Stat label="Top-ups" value={`${walletA.topups_count} · ${inr(walletA.topups_value)}`} />
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Table title="By Source" rows={walletA.by_source} cols={[["source", "Source"], ["credited", "Credited", inr], ["debited", "Debited", inr]]} />
              <Table title="Withdrawals by Status" rows={walletA.withdrawals_by_status} cols={[["status", "Status"], ["count", "Count"], ["amount", "Amount", inr]]} />
            </div>
          </div>
        )}

        {tab === "payments" && payments && <Table title="Payments by Method" rows={payments.by_method} cols={[["method", "Method"], ["count", "Orders"], ["revenue", "Revenue", inr]]} />}

        {tab === "platform" && (
          <div data-testid="platform-analytics">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {[["today", "Today"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["custom", "Custom"]].map(([k, l]) => (
                <button key={k} onClick={() => setPrange(k)} data-testid={`prange-${k}`}
                  className={`rounded-full border px-3 py-1 text-sm ${prange === k ? "border-forest bg-forest text-white" : ""}`}>{l}</button>
              ))}
              {prange === "custom" && (
                <div className="flex items-center gap-2">
                  <Input type="date" value={pstart} onChange={(e) => setPstart(e.target.value)} className="h-8 w-40" data-testid="pstart" />
                  <span className="text-slate-400">to</span>
                  <Input type="date" value={pend} onChange={(e) => setPend(e.target.value)} className="h-8 w-40" data-testid="pend" />
                </div>
              )}
              {platform && <span className="text-xs text-slate-400">{platform.period}</span>}
            </div>

            {platform && (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Registered Customers" value={platform.registered_total} accent="text-forest" />
                  <Stat label="Active Users" value={platform.active_users} sub="in period" />
                  <Stat label="Unique Visitors" value={platform.unique_visitors} sub="web + app" />
                  <Stat label="New Customers" value={platform.website.new_users + platform.app.new_users} sub={`${platform.website.new_users} web · ${platform.app.new_users} app`} />
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  {[["Website", platform.website, "web"], ["Android App", platform.app, "app"]].map(([title, d, key]) => (
                    <div key={key} className="rounded-xl border bg-white p-5" data-testid={`platform-card-${key}`}>
                      <h3 className="text-lg font-bold">{title}</h3>
                      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                        <div><p className="text-2xl font-bold text-forest" data-testid={`${key}-users`}>{d.users}</p><p className="text-xs text-slate-400">Users</p></div>
                        <div><p className="text-2xl font-bold" data-testid={`${key}-orders`}>{d.orders}</p><p className="text-xs text-slate-400">Orders</p></div>
                        <div><p className="text-2xl font-bold" data-testid={`${key}-revenue`}>{inr(d.revenue)}</p><p className="text-xs text-slate-400">Revenue</p></div>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-3 text-center text-sm">
                        <div><p className="font-semibold">{d.new_users}</p><p className="text-xs text-slate-400">New</p></div>
                        <div><p className="font-semibold">{d.unique_visitors}</p><p className="text-xs text-slate-400">Visitors</p></div>
                        <div><p className="font-semibold">{d.returning_visitors}</p><p className="text-xs text-slate-400">Returning</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "reports" && ov && (
          <div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Net Revenue" value={inr(ov.net_revenue)} accent="text-forest" />
              <Stat label="COGS" value={inr(ov.cogs)} />
              <Stat label="Gross Profit" value={inr(ov.gross_profit)} sub={`${ov.gross_margin_pct}% margin`} accent="text-forest" />
              <Stat label="Gateway Fees" value={inr(ov.gateway_fees)} />
              <Stat label="Refunds" value={inr(ov.refunds)} accent="text-red-500" />
              <Stat label="Expenses" value={inr(ov.total_expenses)} accent="text-red-500" />
              <Stat label="Contribution" value={inr(ov.contribution)} />
              <Stat label="Estimated Profit" value={inr(ov.estimated_profit)} accent={ov.estimated_profit >= 0 ? "text-forest" : "text-red-500"} />
            </div>
            <div className="mt-6 rounded-xl border bg-white">
              <div className="flex items-center justify-between border-b p-3 text-sm"><span className="font-semibold">Business Expenses</span><span>Total: <b>{inr(expenses.total)}</b></span></div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Title</th><th className="p-3">Category</th><th className="p-3">Date</th><th className="p-3">Amount</th><th className="p-3"></th></tr></thead>
                <tbody>
                  {expenses.expenses.map((e) => (
                    <tr key={e.id} className="border-t" data-testid={`expense-row-${e.id}`}><td className="p-3">{e.title}</td><td className="p-3 capitalize">{e.category}</td><td className="p-3">{e.date}</td><td className="p-3">{inr(e.amount)}</td>
                      <td className="p-3 text-right"><button onClick={() => delExpense(e.id)} data-testid={`delete-expense-${e.id}`}><Trash2 className="h-4 w-4 text-slate-500 hover:text-red-500" /></button></td></tr>
                  ))}
                  {expenses.expenses.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">No expenses recorded</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Title</Label><Input data-testid="expense-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger data-testid="expense-category"><SelectValue /></SelectTrigger>
                <SelectContent>{["operations", "marketing", "logistics", "salaries", "rent", "other"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Amount (₹)</Label><Input type="number" data-testid="expense-amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={addExpense} data-testid="save-expense-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
