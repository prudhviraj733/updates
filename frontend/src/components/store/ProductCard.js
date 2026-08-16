import { useNavigate } from "react-router-dom";
import { Heart, ShoppingCart, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { inr } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ProductCard({ product }) {
  const navigate = useNavigate();
  const { cart, addToCart, updateQty, wishlist, toggleWishlist } = useStore();
  const inCart = cart.items.find((i) => i.product_id === product.id);
  const outOfStock = product.in_stock === false || product.stock === 0;
  const wished = wishlist.includes(product.id);

  return (
    <div
      data-testid={`product-card-${product.id}`}
      className="group relative flex flex-col rounded-2xl border border-black/5 bg-white overflow-hidden hover:shadow-lg transition-shadow duration-300"
    >
      <button
        data-testid={`wishlist-btn-${product.id}`}
        onClick={() => toggleWishlist(product.id)}
        className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 backdrop-blur border border-black/5 hover:scale-105 transition-transform"
        aria-label="wishlist"
      >
        <Heart className={`h-4 w-4 ${wished ? "fill-saffron text-saffron" : "text-forest"}`} />
      </button>

      {product.discount_percent > 0 && (
        <Badge className="absolute left-3 top-3 z-10 bg-saffron text-white hover:bg-saffron">
          {product.discount_percent}% OFF
        </Badge>
      )}

      <div
        className="aspect-square cursor-pointer overflow-hidden bg-cream"
        onClick={() => navigate(`/product/${product.id}`)}
      >
        <img
          src={product.images?.[0]}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs text-muted-foreground">{product.pack_size}</p>
        <h3
          className="mt-1 line-clamp-2 cursor-pointer font-medium leading-snug text-foreground hover:text-forest"
          onClick={() => navigate(`/product/${product.id}`)}
        >
          {product.name}
        </h3>

        <div className="mt-3 flex items-end justify-between">
          <div>
            <span className="text-lg font-bold text-forest">{inr(product.selling_price)}</span>
            {product.mrp > product.selling_price && (
              <span className="ml-2 text-sm text-muted-foreground line-through">{inr(product.mrp)}</span>
            )}
          </div>
        </div>

        <div className="mt-3">
          {outOfStock ? (
            <Button disabled variant="outline" className="w-full rounded-full" data-testid={`oos-${product.id}`}>
              Out of Stock
            </Button>
          ) : inCart ? (
            <div className="flex items-center justify-between rounded-full bg-forest px-1 text-white">
              <button
                data-testid={`decrease-${product.id}`}
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-forest-dark"
                onClick={() => updateQty(product.id, inCart.quantity - 1)}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="font-semibold" data-testid={`qty-${product.id}`}>{inCart.quantity}</span>
              <button
                data-testid={`increase-${product.id}`}
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-forest-dark"
                onClick={() => {
                  if (inCart.quantity >= product.stock) return toast.error("Reached available stock");
                  updateQty(product.id, inCart.quantity + 1);
                }}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Button
              data-testid={`add-to-cart-${product.id}`}
              onClick={() => addToCart(product)}
              className="w-full rounded-full bg-forest hover:bg-forest-dark hover:-translate-y-0.5 transition-transform"
            >
              <ShoppingCart className="mr-2 h-4 w-4" /> Add
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
