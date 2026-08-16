import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { ProductCard } from "@/components/store/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Products() {
  const [params, setParams] = useSearchParams();
  const { location } = useStore();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const category = params.get("category") || "";
  const search = params.get("search") || "";

  useEffect(() => {
    api.get("/categories").then(({ data }) => setCategories(data));
  }, []);

  useEffect(() => {
    if (!location) return;
    setLoading(true);
    let url = `/products?location_id=${location.id}`;
    if (category) url += `&category_id=${category}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    api.get(url).then(({ data }) => {
      setProducts(data);
      setLoading(false);
    });
  }, [location, category, search]);

  const setCategory = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set("category", id); else next.delete("category");
    next.delete("search");
    setParams(next);
  };

  const activeCat = categories.find((c) => c.id === category);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-bold">
        {search ? `Results for "${search}"` : activeCat ? activeCat.name : "All Products"}
      </h1>

      <div className="mt-5 flex flex-wrap gap-2" data-testid="category-filter">
        <button
          onClick={() => setCategory("")}
          className={`rounded-full border px-4 py-2 text-sm transition-colors ${!category ? "border-forest bg-forest text-white" : "border-border bg-white hover:border-forest/40"}`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            data-testid={`filter-cat-${c.id}`}
            onClick={() => setCategory(c.id)}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${category === c.id ? "border-forest bg-forest text-white" : "border-border bg-white hover:border-forest/40"}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      ) : products.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="font-heading text-xl">No products found</p>
          <p className="text-muted-foreground">Try a different category or search term.</p>
        </div>
      ) : (
        <>
          <Badge variant="secondary" className="mt-6">{products.length} items</Badge>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </>
      )}
    </div>
  );
}
