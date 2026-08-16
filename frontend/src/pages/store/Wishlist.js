import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import api from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { ProductCard } from "@/components/store/ProductCard";

export default function Wishlist() {
  const { wishlist, location } = useStore();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    if (!location) return;
    api.get("/wishlist").then(async ({ data }) => {
      const enriched = await Promise.all(
        data.map((p) => api.get(`/products/${p.id}?location_id=${location.id}`).then((r) => r.data).catch(() => p))
      );
      setProducts(enriched);
    });
  }, [wishlist.length, location]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-bold">My Wishlist</h1>
      {products.length === 0 ? (
        <div className="mt-16 text-center"><Heart className="mx-auto h-14 w-14 text-muted-foreground/40" /><p className="mt-4 font-medium">Your wishlist is empty</p></div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
}
