import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";
import api, { inr } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { useAuth } from "@/context/AuthContext";
import { ProductCard } from "@/components/store/ProductCard";

export function PersonalizedSection() {
  const { location } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!user || user === false || !location) { setData(null); return; }
    api.get(`/me/personalized-home?location_id=${location.id}`).then(({ data }) => setData(data)).catch(() => setData(null));
  }, [user, location]);

  if (!data) return null;
  const hasOffers = data.offers && data.offers.length > 0;
  const hasAgain = data.buy_again && data.buy_again.length > 0;
  if (!hasOffers && !hasAgain) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
      {hasOffers && (
        <section className="mb-6" data-testid="personalized-offers">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-saffron" />
            <h2 className="font-heading text-2xl font-bold sm:text-3xl">Offers for you</h2>
          </div>
          <p className="text-sm text-muted-foreground">Because you shop with us — exclusive, just for you.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.offers.map((o) => (
              <div key={o.code} data-testid={`my-offer-${o.code}`} className="flex items-center justify-between rounded-2xl border-2 border-dashed border-saffron/40 bg-white p-5">
                <div>
                  <p className="font-heading text-xl font-extrabold text-saffron">
                    {o.discount_type === "percentage" ? `${o.discount_value}% OFF` : `${inr(o.discount_value)} OFF`}
                  </p>
                  <p className="text-xs text-muted-foreground">Min order {inr(o.min_order_value)} {o.expiry ? `· till ${o.expiry}` : ""}</p>
                  <p className="mt-2 font-mono text-lg font-bold tracking-wider text-forest">{o.code}</p>
                </div>
                <button onClick={() => navigate("/products")} className="flex items-center gap-1 rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-dark">
                  Shop <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasAgain && (
        <section data-testid="buy-again">
          <h2 className="font-heading text-2xl font-bold sm:text-3xl">Buy Again</h2>
          <p className="text-sm text-muted-foreground">Your regulars, one tap away.</p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {data.buy_again.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
