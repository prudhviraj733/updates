import { useNavigate } from "react-router-dom";
import { Minus, Plus, Trash2, ShoppingBag, Package, Pencil } from "lucide-react";
import { inr } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function CartDrawer() {
  const navigate = useNavigate();
  const { cart, cartOpen, setCartOpen, updateQty, removeItem, removeCombo, location } = useStore();
  const combos = cart.combos || [];
  const isEmpty = (cart.items?.length || 0) === 0 && combos.length === 0;
  const deliveryCharge = location?.delivery_charge || 0;
  const total = (cart.subtotal || 0) + (!isEmpty ? deliveryCharge : 0);

  return (
    <Sheet open={cartOpen} onOpenChange={setCartOpen}>
      <SheetContent className="flex w-full flex-col sm:max-w-md" data-testid="cart-drawer">
        <SheetHeader>
          <SheetTitle className="font-heading text-xl">Your Cart ({cart.count})</SheetTitle>
        </SheetHeader>

        {isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <ShoppingBag className="h-14 w-14 text-muted-foreground/40" />
            <p className="mt-4 font-medium">Your cart is empty</p>
            <p className="text-sm text-muted-foreground">Add fresh groceries to get started</p>
          </div>
        ) : (
          <>
            <div className="-mx-6 flex-1 overflow-y-auto px-6">
              <div className="divide-y">
                {combos.map((c) => (
                  <div key={c.line_id} className="py-4" data-testid={`cart-combo-${c.line_id}`}>
                    <div className="flex gap-3">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-cream">
                        <img src={c.image} alt={c.name} className="h-full w-full object-cover" />
                        <span className="absolute left-0 top-0 bg-forest px-1 py-0.5 text-[9px] font-bold uppercase text-white">Combo</span>
                      </div>
                      <div className="flex-1">
                        <p className="line-clamp-1 flex items-center gap-1 text-sm font-medium"><Package className="h-3.5 w-3.5 text-forest" />{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.items.length} items · qty {c.items.reduce((s, i) => s + i.quantity, 0)}</p>
                        <p className="mt-1 font-semibold text-forest">{inr(c.effective_price)}</p>
                        {c.savings > 0 && <Badge variant="outline" className="mt-1 border-saffron text-saffron">Save {inr(c.savings)}</Badge>}
                      </div>
                      <div className="flex flex-col items-end justify-between">
                        <button onClick={() => removeCombo(c.line_id)} data-testid={`cart-combo-remove-${c.line_id}`}>
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </button>
                        <button
                          onClick={() => { setCartOpen(false); navigate(`/combo/${c.combo_id}?line=${c.line_id}`); }}
                          data-testid={`cart-combo-edit-${c.line_id}`}
                          className="flex items-center gap-1 text-xs font-medium text-forest hover:underline"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                      </div>
                    </div>
                    <ul className="ml-[76px] mt-2 space-y-0.5">
                      {c.items.map((li) => (
                        <li key={li.product_id} className="flex justify-between text-xs text-muted-foreground">
                          <span className="line-clamp-1">{li.quantity}× {li.name}{li.swapped ? " (swapped)" : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

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
