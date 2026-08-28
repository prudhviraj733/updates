import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SlidersHorizontal, X, ChevronRight, PackageX } from "lucide-react";
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
  categories, category, onCategory,
  subs, subcategory, onSubcategory,
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
          <button onClick={() => onCategory("")} data-testid="filter-cat-all" className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm ${!category ? "bg-forest text-white" : "hover:bg-cream"}`}>All categories</button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => onCategory(c.id)} data-testid={`filter-cat-${c.id}`} className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm ${category === c.id ? "bg-forest text-white" : "hover:bg-cream"}`}>{c.name}</button>
          ))}
        </div>
      </div>

      {category && subs.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">Subcategory</p>
          <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
            <button onClick={() => onSubcategory("")} data-testid="filter-sub-all" className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm ${!subcategory ? "bg-forest-light text-forest" : "hover:bg-cream"}`}>All in category</button>
            {subs.map((s) => (
              <button key={s.id} onClick={() => onSubcategory(s.id)} data-testid={`filter-sub-${s.id}`} className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm ${subcategory === s.id ? "bg-forest text-white" : "hover:bg-cream"}`}>{s.name}</button>
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

function Breadcrumb({ items }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground" data-testid="breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          {it.onClick ? (
            <button onClick={it.onClick} className="hover:text-forest" data-testid={`breadcrumb-${i}`}>{it.label}</button>
          ) : (
            <span className="font-medium text-foreground" data-testid={`breadcrumb-${i}`}>{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export default function Products() {
  const [params, setParams] = useSearchParams();
  const { location, pincode } = useStore();
  const [categories, setCategories] = useState([]);
  const [allSubs, setAllSubs] = useState([]);
  const [allSubsubs, setAllSubsubs] = useState([]);
  const [allBrands, setAllBrands] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchResult, setSearchResult] = useState(null);
  const [loading, setLoading] = useState(true);

  const [brandSel, setBrandSel] = useState([]);
  const [priceMax, setPriceMax] = useState(null);
  const [minDiscount, setMinDiscount] = useState(0);
  const [inStockOnly, setInStockOnly] = useState(false);

  const category = params.get("category") || "";
  const subcategory = params.get("subcategory") || "";
  const subsubcategory = params.get("subsubcategory") || "";
  const search = params.get("search") || "";

  useEffect(() => {
    api.get("/categories").then(({ data }) => setCategories(data));
    api.get("/subcategories").then(({ data }) => setAllSubs(data));
    api.get("/subsubcategories").then(({ data }) => setAllSubsubs(data));
    api.get("/brands").then(({ data }) => setAllBrands(data));
  }, []);

  const subsForCat = useMemo(() => allSubs.filter((s) => s.parent_id === category), [allSubs, category]);
  const subsubsForSub = useMemo(() => allSubsubs.filter((ss) => ss.parent_id === subcategory), [allSubsubs, subcategory]);
  const showSubsubChooser = !!subcategory && subsubsForSub.length > 0 && !subsubcategory;

  const resetClientFilters = () => { setBrandSel([]); setMinDiscount(0); setInStockOnly(false); setPriceMax(null); };

  // Search mode — availability-aware resolver
  useEffect(() => {
    if (!location || !search) { setSearchResult(null); return; }
    setLoading(true);
    api.get(`/products/search-resolve?q=${encodeURIComponent(search)}&location_id=${location.id}${pincode ? `&pincode=${pincode}` : ""}`)
      .then(({ data }) => { setSearchResult(data); setProducts(data.products || []); setLoading(false); resetClientFilters(); });
  }, [location, pincode, search]);

  // Browse mode — server-filtered by the selected hierarchy
  useEffect(() => {
    if (!location || search) return;
    if (showSubsubChooser) { setProducts([]); setLoading(false); return; }
    setLoading(true);
    let url = `/products?location_id=${location.id}${pincode ? `&pincode=${pincode}` : ""}`;
    if (category) url += `&category_id=${category}`;
    if (subcategory) url += `&subcategory_id=${subcategory}`;
    if (subsubcategory && subsubcategory !== "all") url += `&subsubcategory_id=${subsubcategory}`;
    api.get(url).then(({ data }) => { setProducts(data); setLoading(false); resetClientFilters(); });
  }, [location, pincode, category, subcategory, subsubcategory, search, showSubsubChooser]);

  const goCategory = (id) => { const n = new URLSearchParams(); if (id) n.set("category", id); setParams(n); };
  const goSubcategory = (id) => { const n = new URLSearchParams(); const c = category || allSubs.find((s) => s.id === subcategory)?.parent_id; if (c) n.set("category", c); if (id) n.set("subcategory", id); setParams(n); };
  const goSubsub = (id) => { const n = new URLSearchParams(); const c = category || allSubs.find((s) => s.id === subcategory)?.parent_id; if (c) n.set("category", c); n.set("subcategory", subcategory); if (id) n.set("subsubcategory", id); setParams(n); };
  const clearSearch = () => setParams(new URLSearchParams());

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
    if (brandSel.length && !brandSel.includes(p.brand_id)) return false;
    if (effMax && (p.selling_price || 0) > effMax) return false;
    if (minDiscount && (p.discount_percent || 0) < minDiscount) return false;
    if (inStockOnly && !p.in_stock) return false;
    return true;
  }), [products, brandSel, effMax, minDiscount, inStockOnly]);

  const activeSub = allSubs.find((s) => s.id === subcategory);
  const activeCat = categories.find((c) => c.id === (category || activeSub?.parent_id));
  const activeSubsub = allSubsubs.find((ss) => ss.id === subsubcategory);
  const toggleBrand = (id) => setBrandSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const clearAll = () => resetClientFilters();
  const activeCount = brandSel.length + (minDiscount ? 1 : 0) + (inStockOnly ? 1 : 0) + (priceMax != null ? 1 : 0);

  const panelProps = {
    categories, category, onCategory: goCategory,
    subs: subsForCat, subcategory, onSubcategory: goSubcategory,
    brands: relevantBrands, brandSel, toggleBrand,
    priceBounds, priceMax: effMax, setPriceMax,
    minDiscount, setMinDiscount, inStockOnly, setInStockOnly, onClear: clearAll,
  };

  // ---------- SEARCH MODE ----------
  if (search) {
    const alts = searchResult?.alternatives || [];
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Seo title={`Search: ${search}`} description={`Search results for ${search} at SavingSmart.`} path="/products" />
        <Breadcrumb items={[{ label: "Home", onClick: clearSearch }, { label: `Search: "${search}"` }]} />
        <h1 className="font-heading text-3xl font-bold">Results for "{search}"</h1>

        {loading ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
          </div>
        ) : searchResult?.status === "available" ? (
          <>
            <Badge variant="secondary" className="mt-4" data-testid="results-count">{filtered.length} items</Badge>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </>
        ) : (
          <>
            <div className="mt-6 rounded-2xl border border-saffron/30 bg-saffron/10 p-5" data-testid="search-unavailable-banner">
              <div className="flex items-start gap-3">
                <PackageX className="mt-0.5 h-6 w-6 shrink-0 text-saffron" />
                <div>
                  {searchResult?.status === "out_of_stock" && searchResult?.unavailable ? (
                    <>
                      <p className="font-heading text-lg font-bold">{searchResult.unavailable.name} is currently out of stock</p>
                      <p className="text-sm text-muted-foreground">{searchResult.message}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-heading text-lg font-bold">No results found</p>
                      <p className="text-sm text-muted-foreground" data-testid="search-message">{searchResult?.message}</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {alts.length > 0 && (
              <>
                <h2 className="mt-8 font-heading text-xl font-bold">Available alternatives</h2>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" data-testid="search-alternatives">
                  {alts.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  // ---------- BROWSE / DRILL-DOWN MODE ----------
  const crumbs = [{ label: "Home", onClick: () => goCategory("") }];
  if (activeCat) crumbs.push({ label: activeCat.name, onClick: subcategory ? () => goCategory(activeCat.id) : undefined });
  if (activeSub) crumbs.push({ label: activeSub.name, onClick: (subsubcategory && subsubcategory !== "all") ? () => goSubcategory(subcategory) : undefined });
  if (activeSubsub) crumbs.push({ label: activeSubsub.name });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Seo
        title={activeSubsub ? activeSubsub.name : activeSub ? activeSub.name : activeCat ? activeCat.name : "All Products"}
        description={activeCat ? `Buy ${activeCat.name} online at SavingSmart with fast delivery.` : "Browse rice, dals, oils, spices, dry fruits and daily essentials at SavingSmart."}
        path="/products"
      />
      {(activeCat || activeSub) && <Breadcrumb items={crumbs} />}

      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-bold">
          {activeSubsub ? activeSubsub.name : activeSub ? activeSub.name : activeCat ? activeCat.name : "All Products"}
        </h1>
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
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 rounded-2xl border border-black/5 bg-white p-5"><FilterPanel {...panelProps} /></div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Sub-subcategory chooser band */}
          {!!subcategory && subsubsForSub.length > 0 && (
            <div className="mb-6" data-testid="subsub-band">
              <p className="mb-3 text-sm font-semibold text-muted-foreground">Choose a type in {activeSub?.name}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => goSubsub(subsubcategory === "all" ? "" : "all")}
                  data-testid="subsub-chip-all"
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${subsubcategory === "all" ? "border-forest bg-forest text-white" : "border-black/10 bg-white hover:border-forest/40"}`}
                >
                  All {activeSub?.name}
                </button>
                {subsubsForSub.map((ss) => (
                  <button
                    key={ss.id}
                    onClick={() => goSubsub(subsubcategory === ss.id ? "" : ss.id)}
                    data-testid={`subsub-chip-${ss.id}`}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${subsubcategory === ss.id ? "border-forest bg-forest text-white" : "border-black/10 bg-white hover:border-forest/40"}`}
                  >
                    {ss.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showSubsubChooser ? (
            <div className="mt-10 text-center" data-testid="subsub-prompt">
              <p className="font-heading text-xl">Pick a type to see products</p>
              <p className="text-muted-foreground">Select one of the options above to browse {activeSub?.name}.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" data-testid="results-count">{filtered.length} items</Badge>
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
                  <p className="text-muted-foreground">Try adjusting your filters or pick another category.</p>
                  {activeCount > 0 && <Button variant="outline" className="mt-4 rounded-full" onClick={clearAll}>Clear filters</Button>}
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
              )}
            </>
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
