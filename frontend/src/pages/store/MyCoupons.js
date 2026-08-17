import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ticket, Copy, Check, Sparkles } from "lucide-react";
import api, { inr } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { Skeleton } from "@/components/ui/skeleton";

export default function MyCoupons() {
  const { location } = useStore();
  const [coupons, setCoupons] = useState(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!location) return;
    api.get(`/me/offers?location_id=${location.id}`).then(({ data }) => setCoupons(data)).catch(() => setCoupons([]));
  }, [location]);

  const copy = (code) => { navigator.clipboard?.writeText(code); setCopied(code); toast.success(`Copied ${code}`); setTimeout(() => setCopied(""), 2000); };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-saffron text-white"><Sparkles className="h-6 w-6" /></div>
        <div>
          <h1 className="font-heading text-3xl font-bold">Your Personalized Offers</h1>
          <p className="text-sm text-muted-foreground">Special offers picked just for you.</p>
        </div>
      </div>

      {coupons === null ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : coupons.length === 0 ? (
        <div className="mt-16 text-center">
          <Ticket className="mx-auto h-14 w-14 text-muted-foreground/40" />
          <p className="mt-4 font-medium">No personalized offers yet</p>
          <p className="text-sm text-muted-foreground">Keep shopping to unlock exclusive rewards.</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {coupons.map((c) => (
            <div key={c.code} data-testid={`mycoupon-${c.code}`} className="relative overflow-hidden rounded-2xl border-2 border-dashed border-saffron/40 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-saffron">{c.campaign_name || "Special offer for you"}</p>
              <p className="mt-1 font-heading text-2xl font-extrabold text-forest">
                {c.discount_type === "percentage" ? `${c.discount_value}% OFF` : `${inr(c.discount_value)} OFF`}
              </p>
              <p className="text-sm text-muted-foreground">
                {c.min_order_value > 0 ? `On orders above ${inr(c.min_order_value)}` : "On your next order"}{c.free_delivery ? " · Free delivery" : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{c.expiry ? `Valid till ${c.expiry}` : ""} · Use {c.usage_limit}x</p>
              <div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-forest/30 bg-forest-light/40 px-4 py-2">
                <span className="font-mono text-lg font-bold tracking-wider text-forest">{c.code}</span>
                <button onClick={() => copy(c.code)} data-testid={`mycopy-${c.code}`} className="flex items-center gap-1 rounded-full bg-forest px-3 py-1.5 text-xs font-semibold text-white hover:bg-forest-dark">
                  {copied === c.code ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
