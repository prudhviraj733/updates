import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ShoppingCart, Tag, RefreshCw, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import api, { inr } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function ComboDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const editLineId = params.get("line");
  const navigate = useNavigate();
  const { location, cart, addCombo, updateCombo } = useStore();
  const { user } = useAuth();
  const [combo, setCombo] = useState(null);
  const [adding, setAdding] = useState(false);
  // selections: originalId -> { product: obj, quantity }
  const [sel, setSel] = useState({});
  const [swapFor, setSwapFor] = useState(null);

  useEffect(() => {
    const q = location ? `?location_id=${location.id}` : "";
    api.get(`/packages/${id}${q}`).then(({ data }) => {
      setCombo(data);
      const existing = (cart.combos || []).find((c) => c.line_id === editLineId);
      const init = {};
      (data.products || []).forEach((orig) => {
        const cfg = orig.config || { default_qty: 1 };
        const es = existing?.selections?.[orig.id];
        let chosen = orig;
        if (es && es.product_id !== orig.id) {
          chosen = (orig.alternatives || []).find((a) => a.id === es.product_id) || orig;
        }
        init[orig.id] = { product: chosen, quantity: es?.quantity ?? cfg.default_qty };
      });
      setSel(init);
    }).catch(() => setCombo(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, location, editLineId]);

  if (combo === null)
    return <div className="mx-auto max-w-5xl px-4 py-10"><Skeleton className="h-72 rounded-3xl" /></div>;
  if (combo === false)
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center">
        <p className="font-heading text-2xl">Combo not found</p>
        <Button className="mt-4 rounded-full bg-forest" onClick={() => navigate("/")}>Back home</Button>
      </div>
    );

  const baseValue = combo.items_value;                        // sum of originals at default qty
  const chosenValue = combo.products.reduce((s, orig) => {
    const c = sel[orig.id]; return s + (c ? c.product.selling_price * c.quantity : 0);
  }, 0);
  const savings = Math.max(0, Math.round((baseValue - combo.price) * 100) / 100);
  const effectivePrice = Math.max(0, Math.round((chosenValue - savings) * 100) / 100);
  const priceDiff = Math.round((effectivePrice - combo.price) * 100) / 100;

  const setQty = (origId, q) => setSel((s) => {
    const orig = combo.products.find((p) => p.id === origId);
    const cfg = orig.config || { min_qty: 1, max_qty: 1 };
    const clamped = Math.max(cfg.min_qty, Math.min(cfg.max_qty, q));
    return { ...s, [origId]: { ...s[origId], quantity: clamped } };
  });

  const pickAlternative = (originalId, product) => {
    setSel((s) => ({ ...s, [originalId]: { ...s[originalId], product } }));
    setSwapFor(null);
    toast.success(`Swapped to ${product.name}`);
  };

  const submit = async () => {
    if (!user || user === false) { toast.error("Please sign in to continue"); return navigate("/login"); }
    if (!location) return;
    const selections = {};
    combo.products.forEach((orig) => {
      const c = sel[orig.id];
      if (c) selections[orig.id] = { product_id: c.product.id, quantity: c.quantity };
    });
    setAdding(true);
    const ok = editLineId ? await updateCombo(editLineId, selections) : await addCombo(combo.id, selections);
    setAdding(false);
    if (ok) {
      toast.success(editLineId ? "Combo updated" : "Combo added to cart");
      navigate("/");
    }
  };

  const swapOrig = combo.products.find((p) => p.id === swapFor);
  const swapCurrent = swapFor ? sel[swapFor]?.product : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <button onClick={() => navigate(-1)} className="mb-5 flex items-center gap-2 text-sm text-muted-foreground hover:text-forest" data-testid="combo-back">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="relative overflow-hidden rounded-3xl" style={{ aspectRatio: "16 / 6" }} data-testid="combo-hero">
        {combo.image_url && <img src={combo.image_url} alt={combo.name} className="absolute inset-0 h-full w-full object-cover" />}
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
            {chosenValue > effectivePrice && <span className="text-lg text-muted-foreground line-through">{inr(chosenValue)}</span>}
          </div>
          {priceDiff !== 0 && (
            <p className="mt-1 text-sm font-medium text-saffron" data-testid="combo-price-diff">{priceDiff > 0 ? `+${inr(priceDiff)} vs base combo` : `${inr(priceDiff)} vs base combo`}</p>
          )}
          {savings > 0 && (
            <p className="mt-1 flex items-center gap-1 font-medium text-saffron" data-testid="combo-savings"><Tag className="h-4 w-4" /> You save {inr(Math.max(0, chosenValue - effectivePrice))}</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">{combo.products.length} items · edit quantity or swap items below</p>
        </div>
        <Button data-testid="combo-add-all" disabled={adding} onClick={submit} className="rounded-full bg-forest px-8 py-6 hover:bg-forest-dark">
          <ShoppingCart className="mr-2 h-5 w-5" /> {adding ? "Saving…" : editLineId ? "Update Combo" : "Add Combo to Cart"}
        </Button>
      </div>

      <h2 className="mt-8 font-heading text-2xl font-bold">What's inside</h2>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {combo.products.map((orig) => {
          const c = sel[orig.id] || { product: orig, quantity: orig.config?.default_qty || 1 };
          const p = c.product;
          const swapped = p.id !== orig.id;
          const cfg = orig.config || { qty_editable: false, min_qty: 1, max_qty: 1 };
          const out = p.stock != null && p.stock < c.quantity;
          return (
            <div key={orig.id} data-testid={`combo-item-${orig.id}`} className="overflow-hidden rounded-2xl border border-black/5 bg-white text-left">
              <div className="aspect-square overflow-hidden bg-cream"><img src={p.images?.[0]} alt={p.name} className="h-full w-full object-cover" /></div>
              <div className="p-3">
                <p className="text-xs text-muted-foreground">{p.pack_size}</p>
                <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                <p className="mt-1 font-semibold text-forest">{inr(p.selling_price)}</p>
                {out && <p className="text-xs font-medium text-destructive">Out of stock</p>}

                {cfg.qty_editable ? (
                  <div className="mt-2 flex items-center gap-2 rounded-full border px-1 w-fit" data-testid={`combo-qty-${orig.id}`}>
                    <button className="grid h-6 w-6 place-items-center disabled:opacity-40" disabled={c.quantity <= cfg.min_qty} onClick={() => setQty(orig.id, c.quantity - 1)} data-testid={`combo-qty-dec-${orig.id}`}><Minus className="h-3 w-3" /></button>
                    <span className="w-5 text-center text-sm font-semibold">{c.quantity}</span>
                    <button className="grid h-6 w-6 place-items-center disabled:opacity-40" disabled={c.quantity >= cfg.max_qty} onClick={() => setQty(orig.id, c.quantity + 1)} data-testid={`combo-qty-inc-${orig.id}`}><Plus className="h-3 w-3" /></button>
                  </div>
                ) : (
                  c.quantity > 1 && <p className="mt-1 text-xs text-muted-foreground">Qty: {c.quantity}</p>
                )}

                {orig.swappable && (
                  <button data-testid={`combo-swap-${orig.id}`} onClick={() => setSwapFor(orig.id)} className="mt-2 flex items-center gap-1 text-xs font-medium text-saffron hover:underline">
                    <RefreshCw className="h-3 w-3" />{swapped ? "Change swap" : "Swap"}
                  </button>
                )}
                {swapped && <button onClick={() => pickAlternative(orig.id, orig)} className="ml-2 mt-2 text-xs text-muted-foreground hover:underline" data-testid={`combo-reset-${orig.id}`}>reset</button>}
              </div>
            </div>
          );
        })}
        {combo.products.length === 0 && <p className="text-sm text-muted-foreground">No items configured for this combo yet.</p>}
      </div>

      <Dialog open={!!swapFor} onOpenChange={(o) => !o && setSwapFor(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Swap "{swapOrig?.name}"</DialogTitle>
            <DialogDescription>Recommended similar items (admin-approved). Any price difference updates automatically.</DialogDescription>
          </DialogHeader>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[swapOrig, ...(swapOrig?.alternatives || [])].filter(Boolean).map((alt) => {
              const active = (swapCurrent?.id || swapFor) === alt.id;
              const diff = Math.round((alt.selling_price - (swapOrig?.selling_price || 0)) * 100) / 100;
              const outOfStock = alt.stock != null && alt.stock <= 0;
              return (
                <button key={alt.id} data-testid={`swap-option-${alt.id}`} disabled={outOfStock} onClick={() => pickAlternative(swapFor, alt)} className={`overflow-hidden rounded-xl border-2 text-left disabled:opacity-40 ${active ? "border-forest" : "border-transparent hover:border-forest/40"}`}>
                  <div className="aspect-square overflow-hidden bg-cream"><img src={alt.images?.[0]} alt={alt.name} className="h-full w-full object-cover" /></div>
                  <div className="p-2">
                    <p className="line-clamp-2 text-xs font-medium">{alt.name}{alt.id === swapOrig?.id ? " (original)" : ""}</p>
                    {alt.recommended && alt.id !== swapOrig?.id && <span className="mt-0.5 inline-block rounded bg-forest/10 px-1.5 py-0.5 text-[10px] font-semibold text-forest">Recommended</span>}
                    <p className="mt-0.5 text-sm font-semibold text-forest">{inr(alt.selling_price)}</p>
                    {alt.id !== swapOrig?.id && diff !== 0 && <p className={`text-xs font-medium ${diff > 0 ? "text-destructive" : "text-forest"}`}>{diff > 0 ? `+${inr(diff)}` : `-${inr(Math.abs(diff))}`}</p>}
                    {outOfStock && <p className="text-xs text-destructive">Out of stock</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
