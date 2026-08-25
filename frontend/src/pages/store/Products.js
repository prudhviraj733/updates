import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SlidersHorizontal, X } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Seo } from "@/components/Seo";
import { useStore } from "@/context/StoreContext";
import { ProductCard } from "@/components/store/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const DISCOUNTS = [10, 25, 50];

function FilterPanel({
  categories, activeCat, onCategory,
  subs, subSel, toggleSub,
  brands, brandSel, toggleBrand,
  priceBounds, priceMax, setPriceMax,
  minDiscount, setMinDiscount,
  inStockOnly, setInStockOnly,
  onClear,
}) {
  return (
    <div className="space-y-6" data-testid="filter-panel">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg font-bold">Filters</h3>
        <button onClick={onClear} data-testid="filter-clear" className="text-xs font-medium text-forest hover:underline">Clear all</button>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Category</p>
        <div className="space-y-1">
          <button onClick={() => onCategory("")} data-testid="filter-cat-all" className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm ${!activeCat ? "bg-forest text-white" : "hover:bg-cream"}`}>All categories</button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => onCategory(c.id)} data-testid={`filter-cat-${c.id}`} className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm ${activeCat === c.id ? "bg-forest text-white" : "hover:bg-cream"}`}>{c.name}</button>
          ))}
        </div>
      </div>

      {subs.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">Subcategory</p>
          <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {subs.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm" data-testid={`filter-sub-${s.id}`}>
                <Checkbox checked={subSel.includes(s.id)} onCheckedChange={() => toggleSub(s.id)} />{s.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {brands.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">Brand</p>
          <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {brands.map((b) => (
              <label key={b.id} className="flex cursor-pointer items-center gap-2 text-sm" data-testid={`filter-brand-${b.id}`}>
                <Checkbox checked={brandSel.includes(b.id)} onCheckedChange={() => toggleBrand(b.id)} />{b.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {priceBounds[1] > priceBounds[0] && (
        <div>
          <p className="mb-2 text-sm font-semibold">Price up to {inr(priceMax)}</p>
          <Slider data-testid="filter-price" min={priceBounds[0]} max={priceBounds[1]} step={10} value={[priceMax]} onValueChange={(v) => setPriceMax(v[0])} />
          <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{inr(priceBounds[0])}</span><span>{inr(priceBounds[1])}</span></div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold">Discount</p>
        <div className="flex flex-wrap gap-2">
          {DISCOUNTS.map((d) => (
            <button key={d} onClick={() => setMinDiscount(minDiscount === d ? 0 : d)} data-testid={`filter-discount-${d}`} className={`rounded-full border px-3 py-1 text-xs ${minDiscount === d ? "border-forest bg-forest text-white" : "hover:border-forest/40"}`}>{d}%+ off</button>
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between text-sm" data-testid="filter-instock">
        <span className="font-semibold">In stock only</span>
        <Switch checked={inStockOnly} onCheckedChange={setInStockOnly} />
      </label>
    </div>
  );
}

export default function Products() {
  const [params, setParams] = useSearchParams();
  const { location, pincode } = useStore();
  const [categories, setCategories] = useState([]);
  const [allSubs, setAllSubs] = useState([]);
  const [allBrands, setAllBrands] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // client-side filters
  const [subSel, setSubSel] = useState([]);
  const [brandSel, setBrandSel] = useState([]);
  const [priceMax, setPriceMax] = useState(null);
  const [minDiscount, setMinDiscount] = useState(0);
  const [inStockOnly, setInStockOnly] = useState(false);

  const category = params.get("category") || "";
  const search = params.get("search") || "";

  useEffect(() => {
    api.get("/categories").then(({ data }) => setCategories(data));
    api.get("/subcategories").then(({ data }) => setAllSubs(data));
    api.get("/brands").then(({ data }) => setAllBrands(data));
  }, []);

  useEffect(() => {
    if (!location) return;
    setLoading(true);
    let url = `/products?location_id=${location.id}${pincode ? `&pincode=${pincode}` : ""}`;
    if (category) url += `&category_id=${category}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    api.get(url).then(({ data }) => {
      setProducts(data);
      setLoading(false);
      // reset dependent client filters when base set changes
      setSubSel([]); setBrandSel([]); setMinDiscount(0); setInStockOnly(false); setPriceMax(null);
    });
  }, [location, category, search]);

  const setCategory = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set("category", id); else next.delete("category");
    setParams(next);
  };

  // relevant facets derived from current base result set
  const relevantSubs = useMemo(() => {
    const ids = new Set(products.map((p) => p.subcategory_id).filter(Boolean));
    return allSubs.filter((s) => ids.has(s.id));
  }, [products, allSubs]);
  const relevantBrands = useMemo(() => {
    const ids = new Set(products.map((p) => p.brand_id).filter(Boolean));
    return allBrands.filter((b) => ids.has(b.id));
  }, [products, allBrands]);
  const priceBounds = useMemo(() => {
    if (!products.length) return [0, 0];
    const prices = products.map((p) => p.selling_price || 0);
    return [Math.floor(Math.min(...prices)), Math.ceil(Math.max(...prices))];
  }, [products]);

  const effMax = priceMax == null ? priceBounds[1] : priceMax;

  const filtered = useMemo(() => products.filter((p) => {
    if (subSel.length && !subSel.includes(p.subcategory_id)) return false;
    if (brandSel.length && !brandSel.includes(p.brand_id)) return false;
    if (effMax && (p.selling_price || 0) > effMax) return false;
    if (minDiscount && (p.discount_percent || 0) < minDiscount) return false;
    if (inStockOnly && !p.in_stock) return false;
    return true;
  }), [products, subSel, brandSel, effMax, minDiscount, inStockOnly]);

  const activeCat = categories.find((c) => c.id === category);
  const toggleSub = (id) => setSubSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleBrand = (id) => setBrandSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const clearAll = () => { setSubSel([]); setBrandSel([]); setMinDiscount(0); setInStockOnly(false); setPriceMax(null); };
  const activeCount = subSel.length + brandSel.length + (minDiscount ? 1 : 0) + (inStockOnly ? 1 : 0) + (priceMax != null ? 1 : 0);

  const panelProps = {
    categories, activeCat: category, onCategory: setCategory,
    subs: relevantSubs, subSel, toggleSub,
    brands: relevantBrands, brandSel, toggleBrand,
    priceBounds, priceMax: effMax, setPriceMax,
    minDiscount, setMinDiscount, inStockOnly, setInStockOnly, onClear: clearAll,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Seo
        title={search ? `Search: ${search}` : activeCat ? activeCat.name : "All Products"}
        description={activeCat ? `Buy ${activeCat.name} online at SavingSmart with fast delivery.` : "Browse rice, dals, oils, spices, dry fruits and daily essentials at SavingSmart."}
        path="/products"
      />
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-bold">
          {search ? `Results for "${search}"` : activeCat ? activeCat.name : "All Products"}
        </h1>
        {/* Mobile filter trigger */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="rounded-full lg:hidden" data-testid="filter-button">
              <SlidersHorizontal className="mr-2 h-4 w-4" />Filters{activeCount ? ` (${activeCount})` : ""}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[85vw] overflow-y-auto sm:w-96">
            <SheetHeader><SheetTitle>Refine results</SheetTitle></SheetHeader>
            <div className="mt-4"><FilterPanel {...panelProps} /></div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="mt-6 flex gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 rounded-2xl border border-black/5 bg-white p-5"><FilterPanel {...panelProps} /></div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" data-testid="results-count">{filtered.length} items</Badge>
            {subSel.map((id) => <Chip key={id} label={relevantSubs.find((s) => s.id === id)?.name} onClear={() => toggleSub(id)} />)}
            {brandSel.map((id) => <Chip key={id} label={relevantBrands.find((b) => b.id === id)?.name} onClear={() => toggleBrand(id)} />)}
            {minDiscount > 0 && <Chip label={`${minDiscount}%+ off`} onClear={() => setMinDiscount(0)} />}
            {inStockOnly && <Chip label="In stock" onClear={() => setInStockOnly(false)} />}
          </div>

          {loading ? (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-16 text-center">
              <p className="font-heading text-xl">No products found</p>
              <p className="text-muted-foreground">Try adjusting your filters or search term.</p>
              {activeCount > 0 && <Button variant="outline" className="mt-4 rounded-full" onClick={clearAll}>Clear filters</Button>}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, onClear }) {
  if (!label) return null;
  return (
    <span className="flex items-center gap-1 rounded-full bg-forest-light px-3 py-1 text-xs text-forest">
      {label}<button onClick={onClear}><X className="h-3 w-3" /></button>
    </span>
  );
}
