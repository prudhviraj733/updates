import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, TrendingUp, Wallet, ShoppingCart, Ticket } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Stat = ({ label, value, sub, accent }) => (
  <div className="rounded-xl border bg-white p-4" data-testid={`stat-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
    <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
    <p className={`mt-1 text-2xl font-bold ${accent || "text-slate-800"}`}>{value}</p>
    {sub && <p className="text-xs text-slate-400">{sub}</p>}
  </div>
);

export default function AdminAnalytics() {
  const [ov, setOv] = useState(null);
  const [prod, setProd] = useState(null);
  const [carts, setCarts] = useState(null);
  const [coupons, setCoupons] = useState(null);
  const [payments, setPayments] = useState(null);
  const [expenses, setExpenses] = useState({ expenses: [], total: 0 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", category: "operations", amount: 0, notes: "" });

  const load = () => {
    api.get("/admin/analytics/overview").then(({ data }) => setOv(data));
    api.get("/admin/analytics/products").then(({ data }) => setProd(data));
    api.get("/admin/analytics/carts").then(({ data }) => setCarts(data));
    api.get("/admin/analytics/coupons").then(({ data }) => setCoupons(data));
    api.get("/admin/analytics/payments").then(({ data }) => setPayments(data));
    api.get("/admin/expenses").then(({ data }) => setExpenses(data));
  };
  useEffect(() => { load(); }, []);

  const addExpense = async () => {
    try {
      await api.post("/admin/expenses", { ...form, amount: Number(form.amount) });
      toast.success("Expense added"); setOpen(false); setForm({ title: "", category: "operations", amount: 0, notes: "" });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };
  const delExpense = async (id) => { await api.delete(`/admin/expenses/${id}`); load(); };

  return (
    <div data-testid="admin-analytics">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Sales &amp; Analytics</h1><p className="text-sm text-slate-500">Financial Control Center</p></div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={() => setOpen(true)} data-testid="add-expense-btn"><Plus className="mr-1 h-4 w-4" />Add Expense</Button>
      </div>

      {ov && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Net Revenue" value={inr(ov.net_revenue)} sub={`${ov.orders_count} orders`} accent="text-forest" />
          <Stat label="Gross Profit" value={inr(ov.gross_profit)} sub={`${ov.gross_margin_pct}% margin`} accent="text-forest" />
          <Stat label="Est. Profit" value={inr(ov.estimated_profit)} sub="after expenses & fees" accent={ov.estimated_profit >= 0 ? "text-forest" : "text-destructive"} />
          <Stat label="AOV" value={inr(ov.average_order_value)} />
          <Stat label="COGS" value={inr(ov.cogs)} />
          <Stat label="Total Discounts" value={inr(ov.total_discount)} sub={`Coupons ${inr(ov.coupon_discount)}`} />
          <Stat label="Delivery Revenue" value={inr(ov.delivery_revenue)} sub={`ASAP ${inr(ov.asap_revenue)}`} />
          <Stat label="Refunds / Fees" value={inr(ov.refunds + ov.gateway_fees)} sub={`Expenses ${inr(ov.total_expenses)}`} accent="text-destructive" />
        </div>
      )}

      <Tabs defaultValue="products" className="mt-8">
        <TabsList>
          <TabsTrigger value="products" data-testid="tab-products"><TrendingUp className="mr-1 h-4 w-4" />Profitability</TabsTrigger>
          <TabsTrigger value="carts" data-testid="tab-carts"><ShoppingCart className="mr-1 h-4 w-4" />Carts</TabsTrigger>
          <TabsTrigger value="coupons" data-testid="tab-coupons"><Ticket className="mr-1 h-4 w-4" />Coupons</TabsTrigger>
          <TabsTrigger value="expenses" data-testid="tab-expenses"><Wallet className="mr-1 h-4 w-4" />Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          {prod && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Table title="Top Products" rows={prod.top_products} cols={[["name", "Product"], ["qty", "Qty"], ["revenue", "Revenue", inr], ["profit", "Profit", inr]]} />
              <Table title="By Category" rows={prod.by_category} cols={[["name", "Category"], ["qty", "Qty"], ["revenue", "Revenue", inr], ["profit", "Profit", inr]]} />
              <Table title="By Brand" rows={prod.by_brand} cols={[["name", "Brand"], ["qty", "Qty"], ["revenue", "Revenue", inr], ["profit", "Profit", inr]]} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="carts">
          {carts && (
            <div>
              <div className="grid gap-4 sm:grid-cols-4">
                <Stat label="Active Carts" value={carts.active_carts} />
                <Stat label="Cart Value" value={inr(carts.cart_value_total)} />
                <Stat label="Abandoned Carts" value={carts.abandoned_carts} accent="text-destructive" />
                <Stat label="Abandoned Value" value={inr(carts.abandoned_value)} accent="text-destructive" />
              </div>
              <div className="mt-6"><Table title="Products In Carts" rows={carts.in_cart_products} cols={[["name", "Product"], ["qty", "Qty in carts"]]} /></div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="coupons">
          {coupons && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Table title="Coupon Usage" rows={coupons.coupon_usage} cols={[["code", "Code"], ["uses", "Uses"], ["discount", "Discount", inr], ["revenue", "Revenue", inr]]} />
              <div className="grid gap-4 sm:grid-cols-2 content-start">
                <Stat label="Personalized Issued" value={coupons.personalized_issued} />
                <Stat label="Personalized Redeemed" value={coupons.personalized_redeemed} />
                {payments?.by_method?.map((m) => <Stat key={m.method} label={`${m.method.toUpperCase()} Orders`} value={m.count} sub={inr(m.revenue)} />)}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="expenses">
          <div className="rounded-xl border bg-white">
            <div className="flex items-center justify-between border-b p-3 text-sm"><span className="font-semibold">Business Expenses</span><span>Total: <b>{inr(expenses.total)}</b></span></div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Title</th><th className="p-3">Category</th><th className="p-3">Date</th><th className="p-3">Amount</th><th className="p-3"></th></tr></thead>
              <tbody>
                {expenses.expenses.map((e) => (
                  <tr key={e.id} className="border-t" data-testid={`expense-row-${e.id}`}>
                    <td className="p-3">{e.title}</td><td className="p-3 capitalize">{e.category}</td><td className="p-3">{e.date}</td><td className="p-3">{inr(e.amount)}</td>
                    <td className="p-3 text-right"><button onClick={() => delExpense(e.id)} data-testid={`delete-expense-${e.id}`}><Trash2 className="h-4 w-4 text-slate-500 hover:text-destructive" /></button></td>
                  </tr>
                ))}
                {expenses.expenses.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">No expenses recorded</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Title</Label><Input data-testid="expense-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div>
              <Label>Category</Label>
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

function Table({ title, rows, cols }) {
  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b p-3 text-sm font-semibold">{title}</div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-500"><tr>{cols.map((c) => <th key={c[0]} className="p-3">{c[1]}</th>)}</tr></thead>
        <tbody>
          {(rows || []).map((r, i) => (
            <tr key={i} className="border-t">{cols.map((c) => <td key={c[0]} className="p-3">{c[2] ? c[2](r[c[0]]) : r[c[0]]}</td>)}</tr>
          ))}
          {(!rows || rows.length === 0) && <tr><td colSpan={cols.length} className="p-6 text-center text-slate-400">No data yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
