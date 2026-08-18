import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ShoppingCart, Tag, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import api, { inr } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ComboDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { location, refreshCart } = useStore();
  const { user } = useAuth();
  const [combo, setCombo] = useState(null);
  const [adding, setAdding] = useState(false);
  const [choices, setChoices] = useState({});   // originalId -> chosen product object
  const [swapFor, setSwapFor] = useState(null); // original product being swapped

  useEffect(() => {
    api.get(`/packages/${id}`).then(({ data }) => {
      setCombo(data);
      const init = {};
      (data.products || []).forEach((p) => { init[p.id] = p; });
      setChoices(init);
    }).catch(() => setCombo(false));
  }, [id]);

  if (combo === null)
    return <div className="mx-auto max-w-5xl px-4 py-10"><Skeleton className="h-72 rounded-3xl" /></div>;
  if (combo === false)
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center">
        <p className="font-heading text-2xl">Combo not found</p>
        <Button className="mt-4 rounded-full bg-forest" onClick={() => navigate("/")}>Back home</Button>
      </div>
    );

  const chosenList = combo.products.map((p) => choices[p.id] || p);
  const baseValue = combo.items_value;
  const chosenValue = chosenList.reduce((s, p) => s + (p.selling_price || 0), 0);
  const priceDiff = Math.round((chosenValue - baseValue) * 100) / 100;
  const effectivePrice = Math.max(0, Math.round((combo.price + priceDiff) * 100) / 100);

  const pickAlternative = (originalId, product) => {
    setChoices((c) => ({ ...c, [originalId]: product }));
    setSwapFor(null);
    toast.success(`Swapped to ${product.name}`);
  };

  const addAll = async () => {
    if (!user || user === false) { toast.error("Please sign in to continue"); return navigate("/login"); }
    if (!location) return;
    setAdding(true);
    let ok = 0;
    for (const p of chosenList) {
      try { await api.post("/cart/items", { product_id: p.id, location_id: location.id, quantity: 1 }); ok++; }
      catch (e) { /* skip out-of-stock */ }
    }
    await refreshCart();
    setAdding(false);
    if (ok) toast.success(`${ok} combo item${ok > 1 ? "s" : ""} added to cart`);
    else toast.error("These combo items are currently unavailable");
  };

  const swapProduct = combo.products.find((p) => p.id === swapFor);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <button onClick={() => navigate(-1)} className="mb-5 flex items-center gap-2 text-sm text-muted-foreground hover:text-forest" data-testid="combo-back">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="relative overflow-hidden rounded-3xl" style={{ aspectRatio: "16 / 6" }} data-testid="combo-hero">
        <img src={combo.image_url} alt={combo.name} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
        <div className="relative flex h-full max-w-xl flex-col justify-center gap-2 p-6 sm:p-10">
          <Badge className="w-fit bg-saffron text-white hover:bg-saffron capitalize">{combo.package_type} combo</Badge>
          <h1 className="font-heading text-2xl font-extrabold text-white sm:text-4xl">{combo.name}</h1>
          <p className="text-sm text-white/85">{combo.description}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-black/5 bg-white p-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-end gap-3">
            <span className="text-3xl font-bold text-forest" data-testid="combo-price">{inr(effectivePrice)}</span>
            {combo.items_value > combo.price && <span className="text-lg text-muted-foreground line-through">{inr(chosenValue)}</span>}
          </div>
          {priceDiff !== 0 && (
            <p className="mt-1 text-sm font-medium text-saffron" data-testid="combo-price-diff">{priceDiff > 0 ? `+${inr(priceDiff)} for your swaps` : `${inr(priceDiff)} with your swaps`}</p>
          )}
          {combo.savings > 0 && priceDiff === 0 && (
            <p className="mt-1 flex items-center gap-1 font-medium text-saffron" data-testid="combo-savings"><Tag className="h-4 w-4" /> You save {inr(combo.savings)}</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">{combo.products.length} items · swap any item marked "Swap"</p>
        </div>
        <Button data-testid="combo-add-all" disabled={adding} onClick={addAll} className="rounded-full bg-forest px-8 py-6 hover:bg-forest-dark">
          <ShoppingCart className="mr-2 h-5 w-5" /> {adding ? "Adding…" : "Add Combo to Cart"}
        </Button>
      </div>

      <h2 className="mt-8 font-heading text-2xl font-bold">What's inside</h2>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {combo.products.map((orig) => {
          const p = choices[orig.id] || orig;
          const swapped = p.id !== orig.id;
          return (
            <div key={orig.id} data-testid={`combo-item-${orig.id}`} className="overflow-hidden rounded-2xl border border-black/5 bg-white text-left">
              <div className="aspect-square overflow-hidden bg-cream"><img src={p.images?.[0]} alt={p.name} className="h-full w-full object-cover" /></div>
              <div className="p-3">
                <p className="text-xs text-muted-foreground">{p.pack_size}</p>
                <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                <p className="mt-1 font-semibold text-forest">{inr(p.selling_price)}</p>
                {orig.swappable && (
                  <button data-testid={`combo-swap-${orig.id}`} onClick={() => setSwapFor(orig.id)} className="mt-2 flex items-center gap-1 text-xs font-medium text-saffron hover:underline">
                    <RefreshCw className="h-3 w-3" />{swapped ? "Change swap" : "Swap"}
                  </button>
                )}
                {swapped && <button onClick={() => pickAlternative(orig.id, orig)} className="ml-2 mt-2 text-xs text-muted-foreground hover:underline">reset</button>}
              </div>
            </div>
          );
        })}
        {combo.products.length === 0 && <p className="text-sm text-muted-foreground">No items configured for this combo yet.</p>}
      </div>

      <Dialog open={!!swapFor} onOpenChange={(o) => !o && setSwapFor(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Swap "{swapProduct?.name}"</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Pick an admin-approved alternative. Any price difference updates automatically.</p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[swapProduct, ...(swapProduct?.alternatives || [])].filter(Boolean).map((alt) => {
              const active = (choices[swapFor]?.id || swapFor) === alt.id;
              return (
                <button key={alt.id} data-testid={`swap-option-${alt.id}`} onClick={() => pickAlternative(swapFor, alt)} className={`overflow-hidden rounded-xl border-2 text-left ${active ? "border-forest" : "border-transparent hover:border-forest/40"}`}>
                  <div className="aspect-square overflow-hidden bg-cream"><img src={alt.images?.[0]} alt={alt.name} className="h-full w-full object-cover" /></div>
                  <div className="p-2"><p className="line-clamp-2 text-xs font-medium">{alt.name}{alt.id === swapProduct?.id ? " (original)" : ""}</p><p className="text-sm font-semibold text-forest">{inr(alt.selling_price)}</p></div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
