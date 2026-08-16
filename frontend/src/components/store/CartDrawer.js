import { useNavigate } from "react-router-dom";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { inr } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function CartDrawer() {
  const navigate = useNavigate();
  const { cart, cartOpen, setCartOpen, updateQty, removeItem, location } = useStore();
  const deliveryCharge = location?.delivery_charge || 0;
  const total = (cart.subtotal || 0) + (cart.items.length ? deliveryCharge : 0);

  return (
    <Sheet open={cartOpen} onOpenChange={setCartOpen}>
      <SheetContent className="flex w-full flex-col sm:max-w-md" data-testid="cart-drawer">
        <SheetHeader>
          <SheetTitle className="font-heading text-xl">Your Cart ({cart.count})</SheetTitle>
        </SheetHeader>

        {cart.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <ShoppingBag className="h-14 w-14 text-muted-foreground/40" />
            <p className="mt-4 font-medium">Your cart is empty</p>
            <p className="text-sm text-muted-foreground">Add fresh groceries to get started</p>
          </div>
        ) : (
          <>
            <div className="-mx-6 flex-1 overflow-y-auto px-6">
              <div className="divide-y">
                {cart.items.map((item) => (
                  <div key={item.product_id} className="flex gap-3 py-4" data-testid={`cart-item-${item.product_id}`}>
                    <img src={item.image} alt={item.name} className="h-16 w-16 rounded-lg object-cover bg-cream" />
                    <div className="flex-1">
                      <p className="line-clamp-1 text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.pack_size}</p>
                      <p className="mt-1 font-semibold text-forest">{inr(item.unit_price)}</p>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <button onClick={() => removeItem(item.product_id)} data-testid={`cart-remove-${item.product_id}`}>
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </button>
                      <div className="flex items-center gap-2 rounded-full border px-1">
                        <button className="grid h-7 w-7 place-items-center" onClick={() => updateQty(item.product_id, item.quantity - 1)}>
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-5 text-center text-sm font-semibold">{item.quantity}</span>
                        <button className="grid h-7 w-7 place-items-center" onClick={() => updateQty(item.product_id, item.quantity + 1)}>
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{inr(cart.subtotal)}</span></div>
                {cart.product_discount > 0 && (
                  <div className="flex justify-between text-forest"><span>Product savings</span><span>-{inr(cart.product_discount)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{inr(deliveryCharge)}</span></div>
                <div className="flex justify-between pt-2 text-base font-bold"><span>Total</span><span>{inr(total)}</span></div>
              </div>
              <Button
                data-testid="checkout-btn"
                className="mt-4 w-full rounded-full bg-forest hover:bg-forest-dark"
                onClick={() => { setCartOpen(false); navigate("/checkout"); }}
              >
                Proceed to Checkout
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
