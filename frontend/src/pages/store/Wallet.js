import { useEffect, useState } from "react";
import { Wallet as WalletIcon, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

const REASON_LABEL = {
  refund: "Refund", referral: "Referral bonus", order_payment: "Order payment",
  adjustment: "Adjustment", goodwill: "Goodwill credit",
};

export default function Wallet() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/me/wallet").then(({ data }) => setData(data)).catch(() => setData({ balance: 0, ledger: [] })); }, []);

  if (!data) return <div className="mx-auto max-w-2xl px-4 py-8"><Skeleton className="h-40 rounded-2xl" /></div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6" data-testid="wallet-page">
      <h1 className="font-heading text-3xl font-bold">My Wallet</h1>

      <div className="mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-forest to-forest-dark p-7 text-white shadow-lg">
        <div className="flex items-center gap-2 text-sm text-white/70"><WalletIcon className="h-4 w-4" />Available balance</div>
        <p className="mt-2 text-4xl font-extrabold" data-testid="wallet-balance">{inr(data.balance)}</p>
        <p className="mt-1 text-xs text-white/60">Use it at checkout to pay for your next order.</p>
      </div>

      <h2 className="mt-8 font-heading text-lg font-bold">Transaction history</h2>
      <div className="mt-3 space-y-2">
        {data.ledger.length === 0 && <p className="text-sm text-muted-foreground">No wallet activity yet.</p>}
        {data.ledger.map((l) => (
          <div key={l.id} className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4" data-testid={`wallet-txn-${l.id}`}>
            <div className={`grid h-10 w-10 place-items-center rounded-full ${l.amount >= 0 ? "bg-forest-light text-forest" : "bg-red-50 text-red-500"}`}>
              {l.amount >= 0 ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{REASON_LABEL[l.reason] || l.reason}</p>
              <p className="text-xs text-muted-foreground">{l.notes || new Date(l.created_at).toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className={`font-semibold ${l.amount >= 0 ? "text-forest" : "text-red-500"}`}>{l.amount >= 0 ? "+" : ""}{inr(l.amount)}</p>
              <p className="text-xs text-muted-foreground">Bal {inr(l.balance_after)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
