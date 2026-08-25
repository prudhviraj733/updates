import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Heart, Minus, Plus, ShoppingCart, ArrowLeft, Truck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import api, { inr } from "@/lib/api";
import { Seo } from "@/components/Seo";
import { useStore } from "@/context/StoreContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { location, cart, addToCart, updateQty, wishlist, toggleWishlist, setCartOpen } = useStore();
  const [product, setProduct] = useState(null);

  useEffect(() => {
    if (!location) return;
    api.get(`/products/${id}?location_id=${location.id}`).then(({ data }) => setProduct(data));
  }, [id, location]);

  if (!product) {
    return (
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-2">
        <Skeleton className="aspect-square rounded-3xl" />
        <div className="space-y-4"><Skeleton className="h-10 w-3/4" /><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24 w-full" /></div>
      </div>
    );
  }

  const inCart = cart.items.find((i) => i.product_id === product.id);
  const outOfStock = product.in_stock === false || product.stock === 0;
  const wished = wishlist.includes(product.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <Seo
        title={product.name}
        description={(product.description || `Buy ${product.name} online at SavingSmart.`).slice(0, 160)}
        image={product.images?.[0]}
        path={`/product/${product.id}`}
        type="product"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          image: product.images || [],
          description: product.description || "",
          brand: { "@type": "Brand", name: product.brand_name || "SavingSmart" },
          offers: {
            "@type": "Offer",
            priceCurrency: "INR",
            price: product.selling_price,
            availability: (product.in_stock === false || product.stock === 0)
              ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
          },
        }}
      />
      <button onClick={() => navigate(-1)} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-forest" data-testid="back-btn">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="grid gap-10 md:grid-cols-2">
        <div className="relative overflow-hidden rounded-3xl border border-black/5 bg-white">
          {product.discount_percent > 0 && (
            <Badge className="absolute left-4 top-4 bg-saffron text-white hover:bg-saffron">{product.discount_percent}% OFF</Badge>
          )}
          <img src={product.images?.[0]} alt={product.name} className="aspect-square w-full object-cover" />
        </div>

        <div>
          <p className="text-sm uppercase tracking-wide text-muted-foreground">{product.pack_size} · {product.unit}</p>
          <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">{product.name}</h1>

          <div className="mt-4 flex items-center gap-3">
            <span className="text-3xl font-bold text-forest">{inr(product.selling_price)}</span>
            {product.mrp > product.selling_price && (
              <span className="text-lg text-muted-foreground line-through">{inr(product.mrp)}</span>
            )}
            {product.discount_percent > 0 && <span className="font-semibold text-saffron">Save {product.discount_percent}%</span>}
          </div>

          <div className="mt-3">
            {outOfStock ? (
              <Badge variant="destructive">Out of stock</Badge>
            ) : product.stock <= 10 ? (
              <Badge className="bg-saffron/15 text-saffron hover:bg-saffron/15">Only {product.stock} left</Badge>
            ) : (
              <Badge className="bg-forest-light text-forest hover:bg-forest-light">In stock</Badge>
            )}
          </div>

          <p className="mt-5 leading-relaxed text-muted-foreground">{product.description}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {outOfStock ? (
              <Button disabled className="rounded-full px-8 py-6">Out of Stock</Button>
            ) : inCart ? (
              <div className="flex items-center gap-1 rounded-full bg-forest px-2 py-1 text-white">
                <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-forest-dark" onClick={() => updateQty(product.id, inCart.quantity - 1)}><Minus className="h-4 w-4" /></button>
                <span className="w-8 text-center font-semibold" data-testid="detail-qty">{inCart.quantity}</span>
                <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-forest-dark" onClick={() => { if (inCart.quantity >= product.stock) return toast.error("Reached available stock"); updateQty(product.id, inCart.quantity + 1); }}><Plus className="h-4 w-4" /></button>
              </div>
            ) : (
              <Button data-testid="detail-add-to-cart" onClick={() => addToCart(product)} className="rounded-full bg-forest px-8 py-6 hover:bg-forest-dark">
                <ShoppingCart className="mr-2 h-5 w-5" /> Add to Cart
              </Button>
            )}
            <Button variant="outline" className="rounded-full py-6" onClick={() => toggleWishlist(product.id)} data-testid="detail-wishlist">
              <Heart className={`h-5 w-5 ${wished ? "fill-saffron text-saffron" : ""}`} />
            </Button>
            {inCart && (
              <Button variant="ghost" className="rounded-full py-6 text-forest" onClick={() => setCartOpen(true)}>View Cart</Button>
            )}
          </div>

          <div className="mt-8 grid gap-3 rounded-2xl border border-black/5 bg-white p-5">
            <div className="flex items-center gap-3 text-sm"><Truck className="h-5 w-5 text-forest" /> Slot-based & express delivery available</div>
            <div className="flex items-center gap-3 text-sm"><ShieldCheck className="h-5 w-5 text-forest" /> Quality checked & securely packed</div>
          </div>
        </div>
      </div>
    </div>
  );
}
