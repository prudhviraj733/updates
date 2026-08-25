import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ticket, Copy, Check, Tag } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Seo } from "@/components/Seo";
import { useStore } from "@/context/StoreContext";
import { Skeleton } from "@/components/ui/skeleton";

export default function Offers() {
  const { location } = useStore();
  const [coupons, setCoupons] = useState(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!location) return;
    api.get(`/coupons?location_id=${location.id}`).then(({ data }) => setCoupons(data));
  }, [location]);

  const copy = (code) => {
    navigator.clipboard?.writeText(code);
    setCopied(code);
    toast.success(`Copied ${code}`);
    setTimeout(() => setCopied(""), 2000);
  };

  const label = (c) => c.discount_type === "percentage"
    ? `${c.discount_value}% OFF${c.max_discount ? ` up to ${inr(c.max_discount)}` : ""}`
    : `${inr(c.discount_value)} OFF`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Seo title="Offers & Coupons" description="Grab the latest grocery coupons and delivery offers at SavingSmart. Apply codes at checkout to save more." path="/offers" />
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-saffron text-white"><Ticket className="h-6 w-6" /></div>
        <div>
          <h1 className="font-heading text-3xl font-bold">Offers & Coupons</h1>
          <p className="text-sm text-muted-foreground">Apply these codes at checkout to save more.</p>
        </div>
      </div>

      {coupons === null ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : coupons.length === 0 ? (
        <div className="mt-16 text-center">
          <Tag className="mx-auto h-14 w-14 text-muted-foreground/40" />
          <p className="mt-4 font-medium">No active offers right now</p>
          <p className="text-sm text-muted-foreground">Check back soon for new deals.</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {coupons.map((c) => (
            <div key={c.code} data-testid={`offer-${c.code}`} className="relative overflow-hidden rounded-2xl border-2 border-dashed border-saffron/40 bg-white p-5">
              <div className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-cream" />
              <div className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-cream" />
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-saffron/10 px-3 py-1 font-heading text-lg font-extrabold text-saffron">{label(c)}</span>
                {c.end_date && <span className="text-xs text-muted-foreground">Till {c.end_date}</span>}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {c.min_order_value > 0 ? `On orders above ${inr(c.min_order_value)}` : "On all orders"}
              </p>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-dashed border-forest/30 bg-forest-light/40 px-4 py-2">
                <span className="font-mono text-lg font-bold tracking-wider text-forest">{c.code}</span>
                <button onClick={() => copy(c.code)} data-testid={`copy-${c.code}`} className="flex items-center gap-1 rounded-full bg-forest px-3 py-1.5 text-xs font-semibold text-white hover:bg-forest-dark">
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
