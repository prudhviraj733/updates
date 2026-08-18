import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet as WalletIcon, ArrowDownLeft, ArrowUpRight, Plus, Banknote } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const REASON_LABEL = {
  refund: "Refund", referral: "Referral bonus", order_payment: "Order payment",
  adjustment: "Adjustment", cashback: "Cashback", milestone: "Milestone reward",
  topup: "Money added", promotional: "Promotional credit", admin_credit: "Store credit",
  withdrawal: "Withdrawal",
};
const WD_COLOR = {
  pending: "bg-amber-100 text-amber-700", approved: "bg-blue-100 text-blue-700",
  processing: "bg-indigo-100 text-indigo-700", completed: "bg-forest-light text-forest",
  rejected: "bg-red-100 text-red-700", failed: "bg-red-100 text-red-700",
};

function loadRzp() {
  return new Promise((res) => {
    if (window.Razorpay) return res(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => res(true); s.onerror = () => res(false);
    document.body.appendChild(s);
  });
}

export default function Wallet() {
  const [data, setData] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [wdOpen, setWdOpen] = useState(false);
  const [amt, setAmt] = useState(500);
  const [wd, setWd] = useState({ amount: "", method: "upi", upi_id: "", account_name: "", account_number: "", ifsc: "" });

  const load = () => api.get("/me/wallet").then(({ data }) => setData(data)).catch(() => setData({ balance: 0, withdrawable_balance: 0, ledger: [], withdrawals: [], withdrawals_enabled: false, min_withdrawal: 0 }));
  useEffect(() => { load(); }, []);

  const addMoney = async () => {
    const a = Number(amt);
    if (a < 1) return toast.error("Enter a valid amount");
    try {
      const { data: order } = await api.post("/me/wallet/topup/create-order", { amount: a });
      const ok = await loadRzp();
      if (!ok) return toast.error("Could not load payment gateway");
      const rzp = new window.Razorpay({
        key: order.key_id, amount: order.amount, currency: order.currency, order_id: order.razorpay_order_id,
        name: "Freshly Wallet", description: "Add money to wallet",
        handler: async (resp) => {
          try { await api.post("/me/wallet/topup/verify", resp); toast.success("Wallet credited!"); setAddOpen(false); load(); }
          catch { toast.error("Payment verification failed"); }
        },
        theme: { color: "#2f6b3f" },
      });
      rzp.open();
    } catch (e) { toast.error(e.response?.data?.detail || "Online payment not configured yet"); }
  };

  const requestWithdraw = async () => {
    try {
      await api.post("/me/wallet/withdraw", { ...wd, amount: Number(wd.amount) });
      toast.success("Withdrawal request submitted"); setWdOpen(false);
      setWd({ amount: "", method: "upi", upi_id: "", account_name: "", account_number: "", ifsc: "" }); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  if (!data) return <div className="mx-auto max-w-2xl px-4 py-8"><Skeleton className="h-40 rounded-2xl" /></div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6" data-testid="wallet-page">
      <h1 className="font-heading text-3xl font-bold">My Wallet</h1>

      <div className="mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-forest to-forest-dark p-7 text-white shadow-lg">
        <div className="flex items-center gap-2 text-sm text-white/70"><WalletIcon className="h-4 w-4" />Available balance</div>
        <p className="mt-2 text-4xl font-extrabold" data-testid="wallet-balance">{inr(data.balance)}</p>
        <p className="mt-1 text-xs text-white/60">Withdrawable: {inr(data.withdrawable_balance)} · Use balance at checkout to pay.</p>
        {data.loyalty?.tier && (
          <div className="mt-3 rounded-2xl bg-white/10 p-3 text-xs" data-testid="loyalty-tier">
            <span className="font-semibold text-white">{data.loyalty.tier} tier</span>
            <span className="text-white/70"> · {data.loyalty.cashback_percent}% cashback on every order</span>
            {data.loyalty.next_tier && <p className="mt-0.5 text-white/60">{data.loyalty.orders_to_next} more order{data.loyalty.orders_to_next > 1 ? "s" : ""} to reach {data.loyalty.next_tier}</p>}
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <Button className="rounded-full bg-white text-forest hover:bg-white/90" onClick={() => setAddOpen(true)} data-testid="add-money-btn"><Plus className="mr-1 h-4 w-4" />Add Money</Button>
          {data.withdrawals_enabled && (
            <Button variant="outline" className="rounded-full border-white/40 bg-transparent text-white hover:bg-white/10" onClick={() => setWdOpen(true)} data-testid="withdraw-btn"><Banknote className="mr-1 h-4 w-4" />Withdraw</Button>
          )}
        </div>
      </div>

      {data.withdrawals?.length > 0 && (
        <div className="mt-6">
          <h2 className="font-heading text-lg font-bold">Withdrawal requests</h2>
          <div className="mt-3 space-y-2">
            {data.withdrawals.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-2xl border border-black/5 bg-white p-4" data-testid={`withdrawal-${w.id}`}>
                <div><p className="text-sm font-medium">{w.request_id} · {inr(w.amount)}</p><p className="text-xs text-muted-foreground">{w.method === "upi" ? w.upi_id : `${w.account_number} / ${w.ifsc}`}</p></div>
                <Badge className={WD_COLOR[w.status]}>{w.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="mt-8 font-heading text-lg font-bold">Transaction history</h2>
      <div className="mt-3 space-y-2">
        {data.ledger.length === 0 && <p className="text-sm text-muted-foreground">No wallet activity yet.</p>}
        {data.ledger.map((l) => (
          <div key={l.id} className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4" data-testid={`wallet-txn-${l.id}`}>
            <div className={`grid h-10 w-10 place-items-center rounded-full ${l.amount >= 0 ? "bg-forest-light text-forest" : "bg-red-50 text-red-500"}`}>
              {l.amount >= 0 ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{REASON_LABEL[l.source] || REASON_LABEL[l.reason] || l.reason}</p>
              <p className="text-xs text-muted-foreground">{l.notes || new Date(l.created_at).toLocaleString()} {l.txn_id ? `· ${l.txn_id}` : ""}</p>
            </div>
            <div className="text-right">
              <p className={`font-semibold ${l.amount >= 0 ? "text-forest" : "text-red-500"}`}>{l.amount >= 0 ? "+" : ""}{inr(l.amount)}</p>
              <p className="text-xs text-muted-foreground">Bal {inr(l.balance_after)}</p>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add money to wallet</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="flex gap-2">{[200, 500, 1000, 2000].map((v) => <button key={v} onClick={() => setAmt(v)} className={`flex-1 rounded-full border py-1.5 text-sm ${Number(amt) === v ? "border-forest bg-forest-light text-forest" : ""}`} data-testid={`quick-amt-${v}`}>₹{v}</button>)}</div>
            <div><Label>Amount (₹)</Label><Input type="number" data-testid="topup-amount" value={amt} onChange={(e) => setAmt(e.target.value)} /></div>
          </div>
          <DialogFooter><Button className="w-full bg-forest hover:bg-forest-dark" onClick={addMoney} data-testid="pay-topup-btn">Pay with Razorpay</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wdOpen} onOpenChange={setWdOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Withdraw money</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-xs text-muted-foreground">Eligible to withdraw: <b className="text-forest">{inr(data.withdrawable_balance)}</b> · Min {inr(data.min_withdrawal)}</p>
            <div><Label>Amount (₹)</Label><Input type="number" data-testid="withdraw-amount" value={wd.amount} onChange={(e) => setWd({ ...wd, amount: e.target.value })} /></div>
            <div>
              <Label>Method</Label>
              <Select value={wd.method} onValueChange={(v) => setWd({ ...wd, method: v })}>
                <SelectTrigger data-testid="withdraw-method"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="upi">UPI</SelectItem><SelectItem value="bank">Bank transfer</SelectItem></SelectContent>
              </Select>
            </div>
            {wd.method === "upi" ? (
              <div><Label>UPI ID</Label><Input data-testid="withdraw-upi" value={wd.upi_id} onChange={(e) => setWd({ ...wd, upi_id: e.target.value })} placeholder="name@bank" /></div>
            ) : (
              <>
                <div><Label>Account holder</Label><Input value={wd.account_name} onChange={(e) => setWd({ ...wd, account_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Account no.</Label><Input value={wd.account_number} onChange={(e) => setWd({ ...wd, account_number: e.target.value })} /></div>
                  <div><Label>IFSC</Label><Input value={wd.ifsc} onChange={(e) => setWd({ ...wd, ifsc: e.target.value })} /></div>
                </div>
              </>
            )}
          </div>
          <DialogFooter><Button className="w-full bg-forest hover:bg-forest-dark" onClick={requestWithdraw} data-testid="submit-withdraw-btn">Request withdrawal</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
