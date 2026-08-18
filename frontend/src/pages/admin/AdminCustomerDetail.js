import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Wallet } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const Stat = ({ label, value, accent }) => (
  <div className="rounded-xl border bg-white p-4"><p className="text-xs uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-1 text-xl font-bold ${accent || "text-slate-800"}`}>{value}</p></div>
);

export default function AdminCustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [adj, setAdj] = useState({ amount: 0, reason: "adjustment", notes: "" });

  const load = () => api.get(`/admin/customers/${id}/full`).then(({ data }) => setData(data)).catch(() => toast.error("Failed to load customer"));
  useEffect(() => { load(); }, [id]);

  const adjustWallet = async () => {
    try {
      await api.post("/admin/wallet/adjust", { user_id: id, amount: Number(adj.amount), reason: adj.reason, notes: adj.notes });
      toast.success("Wallet updated"); setOpen(false); setAdj({ amount: 0, reason: "adjustment", notes: "" }); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  if (!data) return <div className="p-6 text-slate-400">Loading…</div>;
  const { profile, summary, orders, behaviour, addresses, coupons, wallet, referrals, abandoned_carts } = data;

  return (
    <div data-testid="admin-customer-detail" className="max-w-6xl">
      <button onClick={() => navigate("/admin/customers")} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-forest"><ArrowLeft className="h-4 w-4" />Back to customers</button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{profile.name}</h1>
          <p className="text-sm text-slate-500">{profile.email} · {profile.phone}</p>
          {profile.referral_code && <p className="text-xs text-slate-400">Referral code: <b>{profile.referral_code}</b></p>}
        </div>
        <Button variant="outline" onClick={() => setOpen(true)} data-testid="adjust-wallet-btn"><Wallet className="mr-1 h-4 w-4" />Adjust / Refund Wallet</Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Orders" value={summary.order_count} />
        <Stat label="Total Spend" value={inr(summary.total_spend)} accent="text-forest" />
        <Stat label="AOV" value={inr(summary.aov)} />
        <Stat label="Cancelled" value={summary.cancelled_orders} />
        <Stat label="Wallet" value={inr(summary.wallet_balance)} accent="text-forest" />
        <Stat label="Referrals" value={summary.referral_count} />
      </div>

      <Tabs defaultValue="orders" className="mt-8">
        <TabsList>
          <TabsTrigger value="orders" data-testid="tab-c-orders">Orders</TabsTrigger>
          <TabsTrigger value="behaviour" data-testid="tab-c-behaviour">Behaviour</TabsTrigger>
          <TabsTrigger value="coupons" data-testid="tab-c-coupons">Coupons</TabsTrigger>
          <TabsTrigger value="wallet" data-testid="tab-c-wallet">Wallet</TabsTrigger>
          <TabsTrigger value="referrals" data-testid="tab-c-referrals">Referrals</TabsTrigger>
          <TabsTrigger value="carts" data-testid="tab-c-carts">Abandoned</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <div className="rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Order</th><th className="p-3">Date</th><th className="p-3">Total</th><th className="p-3">Status</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="cursor-pointer border-t hover:bg-slate-50" onClick={() => navigate(`/admin/orders/${o.id}`)} data-testid={`c-order-${o.id}`}>
                    <td className="p-3 font-medium">{o.order_number}</td><td className="p-3">{new Date(o.created_at).toLocaleDateString()}</td><td className="p-3">{inr(o.final_amount)}</td>
                    <td className="p-3"><Badge className="bg-slate-100 text-slate-600 capitalize">{o.status?.replace(/_/g, " ")}</Badge></td>
                  </tr>
                ))}
                {orders.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">No orders</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="behaviour">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border bg-white p-4"><p className="mb-3 font-semibold">Favourite Products</p>{behaviour.favourite_products.map(([n, c]) => <div key={n} className="flex justify-between py-1 text-sm"><span>{n}</span><span className="text-slate-400">{c}×</span></div>)}{behaviour.favourite_products.length === 0 && <p className="text-sm text-slate-400">No data</p>}</div>
            <div className="rounded-xl border bg-white p-4"><p className="mb-3 font-semibold">Favourite Categories</p>{behaviour.favourite_categories.map(([n, c]) => <div key={n} className="flex justify-between py-1 text-sm"><span>{n}</span><span className="text-slate-400">{c}×</span></div>)}{behaviour.favourite_categories.length === 0 && <p className="text-sm text-slate-400">No data</p>}</div>
            <div className="rounded-xl border bg-white p-4 sm:col-span-2"><p className="mb-3 font-semibold">Addresses</p>{addresses.map((a) => <p key={a.id} className="py-1 text-sm text-slate-600">{a.label}: {a.line1}, {a.area} {a.city} - {a.pincode}</p>)}{addresses.length === 0 && <p className="text-sm text-slate-400">No addresses</p>}</div>
          </div>
        </TabsContent>

        <TabsContent value="coupons">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border bg-white p-4"><p className="mb-3 font-semibold">Active Coupons</p>{coupons.current.map((c) => <div key={c.id} className="flex justify-between py-1 text-sm"><span className="font-mono">{c.code}</span><span className="text-slate-400">{c.discount_type === "percentage" ? `${c.discount_value}%` : inr(c.discount_value)}</span></div>)}{coupons.current.length === 0 && <p className="text-sm text-slate-400">None</p>}</div>
            <div className="rounded-xl border bg-white p-4"><p className="mb-3 font-semibold">Redeemed ({coupons.redeemed.length})</p>{coupons.redeemed.map((c) => <div key={c.id} className="py-1 font-mono text-sm text-slate-500">{c.code}</div>)}{coupons.redeemed.length === 0 && <p className="text-sm text-slate-400">None</p>}</div>
          </div>
        </TabsContent>

        <TabsContent value="wallet">
          <div className="rounded-xl border bg-white">
            <div className="flex items-center justify-between border-b p-3"><span className="font-semibold">Wallet Ledger</span><span>Balance: <b className="text-forest">{inr(wallet.balance)}</b></span></div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Reason</th><th className="p-3">Notes</th><th className="p-3">Amount</th><th className="p-3">Balance</th></tr></thead>
              <tbody>
                {wallet.ledger.map((l) => (
                  <tr key={l.id} className="border-t"><td className="p-3">{new Date(l.created_at).toLocaleDateString()}</td><td className="p-3 capitalize">{l.reason}</td><td className="p-3 text-slate-500">{l.notes}</td>
                    <td className={`p-3 font-semibold ${l.amount >= 0 ? "text-forest" : "text-destructive"}`}>{l.amount >= 0 ? "+" : ""}{inr(l.amount)}</td><td className="p-3">{inr(l.balance_after)}</td></tr>
                ))}
                {wallet.ledger.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">No wallet activity</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="referrals">
          <div className="rounded-xl border bg-white p-4">{referrals.map((r) => <div key={r.id} className="flex justify-between border-b py-2 text-sm last:border-0"><span>{r.referred_name}</span><span className="text-forest">+{inr(r.reward)}</span></div>)}{referrals.length === 0 && <p className="text-sm text-slate-400">No referrals yet</p>}</div>
        </TabsContent>

        <TabsContent value="carts">
          <div className="rounded-xl border bg-white p-4">{abandoned_carts.map((c, i) => <div key={i} className="flex justify-between border-b py-2 text-sm last:border-0"><span>{c.item_count} items</span><span className="text-slate-500">{inr(c.value)}</span></div>)}{abandoned_carts.length === 0 && <p className="text-sm text-slate-400">No abandoned carts</p>}</div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adjust Wallet</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Amount (₹) — positive to credit, negative to debit</Label><Input type="number" data-testid="wallet-amount" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></div>
            <div><Label>Reason</Label><Input data-testid="wallet-reason" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} placeholder="refund / goodwill / adjustment" /></div>
            <div><Label>Notes</Label><Input value={adj.notes} onChange={(e) => setAdj({ ...adj, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={adjustWallet} data-testid="save-wallet-btn">Apply</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
