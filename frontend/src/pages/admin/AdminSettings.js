import { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function AdminSettings() {
  const [s, setS] = useState(null);
  const [payConfig, setPayConfig] = useState({ razorpay_enabled: false });

  useEffect(() => {
    api.get("/admin/settings").then(({ data }) => setS(data));
    api.get("/payments/config").then(({ data }) => setPayConfig(data));
  }, []);

  const save = async () => {
    try {
      await api.put("/admin/settings", {
        store_name: s.store_name, support_phone: s.support_phone, support_email: s.support_email,
        currency: s.currency, cod_enabled: s.cod_enabled, online_payment_enabled: s.online_payment_enabled,
        cashback_enabled: s.cashback_enabled, cashback_percent: Number(s.cashback_percent), cashback_max: Number(s.cashback_max),
        milestone_enabled: s.milestone_enabled, milestone_rewards: s.milestone_rewards,
        withdrawals_enabled: s.withdrawals_enabled, min_withdrawal: Number(s.min_withdrawal),
        withdrawable_sources: s.withdrawable_sources,
      });
      toast.success("Settings saved");
    } catch (e) { toast.error("Error"); }
  };

  if (!s) return <p>Loading…</p>;
  const ALL_SOURCES = ["topup", "refund", "referral", "promotional", "admin_credit", "cashback", "milestone"];
  const toggleSource = (src) => {
    const cur = s.withdrawable_sources || [];
    setS({ ...s, withdrawable_sources: cur.includes(src) ? cur.filter((x) => x !== src) : [...cur, src] });
  };
  const setMilestone = (k, v) => setS({ ...s, milestone_rewards: { ...(s.milestone_rewards || {}), [k]: Number(v) } });

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Business Settings</h1>
      <p className="text-sm text-slate-500">Control store info, payments, wallet rewards & withdrawals</p>

      <div className="mt-6 space-y-4 rounded-xl border bg-white p-6">
        <div><Label>Store name</Label><Input data-testid="store-name" value={s.store_name || ""} onChange={(e) => setS({ ...s, store_name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Support phone</Label><Input value={s.support_phone || ""} onChange={(e) => setS({ ...s, support_phone: e.target.value })} /></div>
          <div><Label>Support email</Label><Input value={s.support_email || ""} onChange={(e) => setS({ ...s, support_email: e.target.value })} /></div>
        </div>

        <div className="border-t pt-4">
          <h2 className="font-semibold">Payment options</h2>
          <label className="mt-3 flex items-center justify-between text-sm"><span>Cash on Delivery</span><Switch checked={s.cod_enabled} onCheckedChange={(v) => setS({ ...s, cod_enabled: v })} data-testid="cod-toggle" /></label>
          <label className="mt-2 flex items-center justify-between text-sm"><span>Online payment (Razorpay)</span><Switch checked={s.online_payment_enabled} onCheckedChange={(v) => setS({ ...s, online_payment_enabled: v })} data-testid="online-toggle" /></label>
          <p className={`mt-2 text-xs ${payConfig.razorpay_enabled ? "text-forest" : "text-amber-600"}`}>Razorpay keys: {payConfig.razorpay_enabled ? "Configured ✓" : "Not configured — wallet top-ups need RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET"}</p>
        </div>

        <div className="border-t pt-4">
          <h2 className="font-semibold">Wallet rewards</h2>
          <label className="mt-3 flex items-center justify-between text-sm"><span>Cashback on delivered orders</span><Switch checked={s.cashback_enabled} onCheckedChange={(v) => setS({ ...s, cashback_enabled: v })} data-testid="cashback-toggle" /></label>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div><Label>Cashback %</Label><Input type="number" data-testid="cashback-percent" value={s.cashback_percent ?? ""} onChange={(e) => setS({ ...s, cashback_percent: e.target.value })} /></div>
            <div><Label>Max cashback (₹)</Label><Input type="number" data-testid="cashback-max" value={s.cashback_max ?? ""} onChange={(e) => setS({ ...s, cashback_max: e.target.value })} /></div>
          </div>
          <label className="mt-3 flex items-center justify-between text-sm"><span>Milestone rewards</span><Switch checked={s.milestone_enabled} onCheckedChange={(v) => setS({ ...s, milestone_enabled: v })} data-testid="milestone-toggle" /></label>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div><Label>Reward after 5th order (₹)</Label><Input type="number" data-testid="milestone-5" value={s.milestone_rewards?.["5"] ?? ""} onChange={(e) => setMilestone("5", e.target.value)} /></div>
            <div><Label>Reward after 10th order (₹)</Label><Input type="number" data-testid="milestone-10" value={s.milestone_rewards?.["10"] ?? ""} onChange={(e) => setMilestone("10", e.target.value)} /></div>
          </div>
        </div>

        <div className="border-t pt-4">
          <h2 className="font-semibold">Wallet withdrawals</h2>
          <label className="mt-3 flex items-center justify-between text-sm"><span>Allow withdrawals</span><Switch checked={s.withdrawals_enabled} onCheckedChange={(v) => setS({ ...s, withdrawals_enabled: v })} data-testid="withdrawals-toggle" /></label>
          <div className="mt-3"><Label>Minimum withdrawal (₹)</Label><Input type="number" data-testid="min-withdrawal" value={s.min_withdrawal ?? ""} onChange={(e) => setS({ ...s, min_withdrawal: e.target.value })} /></div>
          <p className="mt-3 text-sm font-medium">Withdrawable credit types</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ALL_SOURCES.map((src) => (
              <button key={src} onClick={() => toggleSource(src)} data-testid={`wsrc-${src}`} className={`rounded-full border px-3 py-1 text-xs capitalize ${(s.withdrawable_sources || []).includes(src) ? "border-forest bg-forest text-white" : "text-slate-500"}`}>{src.replace("_", " ")}</button>
            ))}
          </div>
        </div>

        <Button className="bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-settings-btn">Save settings</Button>
      </div>
    </div>
  );
}
