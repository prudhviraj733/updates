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
      });
      toast.success("Settings saved");
    } catch (e) { toast.error("Error"); }
  };

  if (!s) return <p>Loading…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Business Settings</h1>
      <p className="text-sm text-slate-500">Control store info & payment options without touching code</p>

      <div className="mt-6 space-y-4 rounded-xl border bg-white p-6">
        <div><Label>Store name</Label><Input data-testid="store-name" value={s.store_name || ""} onChange={(e) => setS({ ...s, store_name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Support phone</Label><Input value={s.support_phone || ""} onChange={(e) => setS({ ...s, support_phone: e.target.value })} /></div>
          <div><Label>Support email</Label><Input value={s.support_email || ""} onChange={(e) => setS({ ...s, support_email: e.target.value })} /></div>
        </div>
        <div><Label>Currency</Label><Input value={s.currency || ""} onChange={(e) => setS({ ...s, currency: e.target.value })} /></div>

        <div className="border-t pt-4">
          <h2 className="font-semibold">Payment options</h2>
          <label className="mt-3 flex items-center justify-between text-sm"><span>Cash on Delivery</span><Switch checked={s.cod_enabled} onCheckedChange={(v) => setS({ ...s, cod_enabled: v })} data-testid="cod-toggle" /></label>
          <label className="mt-2 flex items-center justify-between text-sm"><span>Online payment (Razorpay)</span><Switch checked={s.online_payment_enabled} onCheckedChange={(v) => setS({ ...s, online_payment_enabled: v })} data-testid="online-toggle" /></label>
          <p className={`mt-2 text-xs ${payConfig.razorpay_enabled ? "text-forest" : "text-amber-600"}`}>
            Razorpay keys: {payConfig.razorpay_enabled ? "Configured ✓" : "Not configured — add RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET to backend .env"}
          </p>
        </div>

        <Button className="bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-settings-btn">Save settings</Button>
      </div>
    </div>
  );
}
