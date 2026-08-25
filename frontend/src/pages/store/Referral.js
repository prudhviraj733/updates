import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Gift, Copy, Check, Users } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export default function Referral() {
  const [data, setData] = useState(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const load = () => api.get("/me/referral").then(({ data }) => setData(data));
  useEffect(() => { load(); }, []);

  const copy = async () => {
    try { await navigator.clipboard?.writeText(data.referral_code); } catch { /* clipboard blocked */ }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
    toast.success("Referral code copied");
  };
  const share = async () => {
    const text = `Shop fresh groceries on SavingSmart! Use my code ${data.referral_code} and we both earn wallet cash.`;
    try {
      if (navigator.share) { await navigator.share({ title: "SavingSmart", text }); }
      else { await navigator.clipboard?.writeText(text); toast.success("Invite message copied"); }
    } catch { /* user dismissed share / clipboard blocked */ }
  };
  const apply = async () => {
    if (!code.trim()) return;
    try { const { data } = await api.post(`/referral/apply?code=${encodeURIComponent(code.trim())}`); toast.success(data.message); setCode(""); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Invalid code"); }
  };

  if (!data) return <div className="mx-auto max-w-2xl px-4 py-8"><Skeleton className="h-52 rounded-2xl" /></div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6" data-testid="referral-page">
      <h1 className="font-heading text-3xl font-bold">Refer &amp; Earn</h1>
      <p className="mt-1 text-sm text-muted-foreground">Invite a friend — they get ₹50, you get ₹100 in your wallet.</p>

      <div className="mt-6 rounded-3xl border-2 border-dashed border-forest/30 bg-forest-light/40 p-7 text-center">
        <Gift className="mx-auto h-10 w-10 text-forest" />
        <p className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">Your referral code</p>
        <p className="mt-1 font-heading text-4xl font-extrabold tracking-wider text-forest" data-testid="referral-code">{data.referral_code}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" className="rounded-full" onClick={copy} data-testid="copy-referral">{copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}{copied ? "Copied" : "Copy"}</Button>
          <Button className="rounded-full bg-forest hover:bg-forest-dark" onClick={share} data-testid="share-referral"><Users className="mr-1 h-4 w-4" />Invite a friend</Button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-black/5 bg-white p-5">
        <p className="text-sm font-semibold">Have a friend's code?</p>
        <div className="mt-2 flex gap-2">
          <Input placeholder="Enter referral code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="rounded-full" data-testid="referral-input" />
          <Button className="rounded-full bg-forest hover:bg-forest-dark" onClick={apply} data-testid="apply-referral">Apply</Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">You can apply a referral code once.</p>
      </div>

      <div className="mt-6">
        <p className="font-heading text-lg font-bold">Your referrals ({data.count})</p>
        <div className="mt-3 space-y-2">
          {data.referrals.length === 0 && <p className="text-sm text-muted-foreground">No referrals yet — start inviting!</p>}
          {data.referrals.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl border border-black/5 bg-white p-4" data-testid={`referral-row-${r.id}`}>
              <span className="text-sm font-medium">{r.referred_name || "New customer"}</span>
              <span className="font-semibold text-forest">+{inr(r.reward)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
