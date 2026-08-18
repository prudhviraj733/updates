import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const WD_COLOR = {
  pending: "bg-amber-100 text-amber-700", approved: "bg-blue-100 text-blue-700",
  processing: "bg-indigo-100 text-indigo-700", completed: "bg-forest-light text-forest",
  rejected: "bg-red-100 text-red-700", failed: "bg-red-100 text-red-700",
};
const NEXT = { pending: ["approved", "rejected"], approved: ["processing", "rejected"], processing: ["completed", "failed"] };

export default function AdminWalletManagement() {
  const navigate = useNavigate();
  const [balances, setBalances] = useState({ balances: [], total_liability: 0, customers: 0 });
  const [withdrawals, setWithdrawals] = useState([]);
  const [filter, setFilter] = useState("");
  const [acting, setActing] = useState(null);
  const [note, setNote] = useState("");
  const [nextStatus, setNextStatus] = useState("");

  const load = () => {
    api.get("/admin/wallet/overview/balances").then(({ data }) => setBalances(data));
    const q = filter ? `?status=${filter}` : "";
    api.get(`/admin/withdrawals${q}`).then(({ data }) => setWithdrawals(data));
  };
  useEffect(() => { load(); }, [filter]);

  const submit = async () => {
    try {
      await api.put(`/admin/withdrawals/${acting.id}/status`, { status: nextStatus, admin_note: note });
      toast.success(`Marked ${nextStatus}`); setActing(null); setNote(""); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  return (
    <div data-testid="admin-wallet-management">
      <h1 className="text-2xl font-bold">Wallet Management</h1>
      <p className="text-sm text-slate-500">Customer wallet balances &amp; withdrawal requests</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4"><p className="text-xs uppercase text-slate-400">Total Wallet Liability</p><p className="mt-1 text-2xl font-bold text-forest">{inr(balances.total_liability)}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs uppercase text-slate-400">Customers w/ Balance</p><p className="mt-1 text-2xl font-bold">{balances.customers}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs uppercase text-slate-400">Pending Withdrawals</p><p className="mt-1 text-2xl font-bold text-amber-600">{withdrawals.filter((w) => w.status === "pending").length}</p></div>
      </div>

      <h2 className="mt-8 font-semibold">Withdrawal Requests</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {["", "pending", "approved", "processing", "completed", "rejected", "failed"].map((s) => (
          <button key={s} onClick={() => setFilter(s)} data-testid={`wd-filter-${s || "all"}`} className={`rounded-full border px-3 py-1 text-sm capitalize ${filter === s ? "border-forest bg-forest text-white" : ""}`}>{s || "All"}</button>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Request</th><th className="p-3">Customer</th><th className="p-3">Amount</th><th className="p-3">Method</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
          <tbody>
            {withdrawals.map((w) => (
              <tr key={w.id} className="border-t" data-testid={`wd-row-${w.id}`}>
                <td className="p-3 font-mono text-xs">{w.request_id}<p className="text-slate-400">{new Date(w.created_at).toLocaleDateString()}</p></td>
                <td className="p-3">{w.customer_name}</td>
                <td className="p-3 font-semibold">{inr(w.amount)}</td>
                <td className="p-3">{w.method === "upi" ? w.upi_id : `${w.account_number || ""} ${w.ifsc || ""}`}</td>
                <td className="p-3"><Badge className={WD_COLOR[w.status]}>{w.status}</Badge></td>
                <td className="p-3">
                  {NEXT[w.status]?.map((ns) => (
                    <Button key={ns} size="sm" variant="outline" className="mr-1 capitalize" onClick={() => { setActing(w); setNextStatus(ns); setNote(""); }} data-testid={`wd-action-${w.id}-${ns}`}>{ns}</Button>
                  ))}
                </td>
              </tr>
            ))}
            {withdrawals.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">No withdrawal requests</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 font-semibold">Wallet Balances</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Customer</th><th className="p-3">Email</th><th className="p-3">Balance</th><th className="p-3">Withdrawable</th><th className="p-3"></th></tr></thead>
          <tbody>
            {balances.balances.map((b) => (
              <tr key={b.user_id} className="border-t" data-testid={`bal-row-${b.user_id}`}>
                <td className="p-3 font-medium">{b.name}</td><td className="p-3 text-slate-500">{b.email}</td>
                <td className="p-3 font-semibold text-forest">{inr(b.balance)}</td><td className="p-3">{inr(b.withdrawable)}</td>
                <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => navigate(`/admin/customers/${b.user_id}`)}>Open 360</Button></td>
              </tr>
            ))}
            {balances.balances.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">No wallet balances</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!acting} onOpenChange={(o) => !o && setActing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="capitalize">Mark withdrawal {nextStatus}</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">{acting?.request_id} · {inr(acting?.amount)} to {acting?.method === "upi" ? acting?.upi_id : acting?.account_number}</p>
          <Textarea placeholder="Admin note (optional)" value={note} onChange={(e) => setNote(e.target.value)} data-testid="wd-note" />
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={submit} data-testid="wd-confirm-btn">Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
