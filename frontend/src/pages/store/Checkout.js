import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MapPin, Plus, Zap, Clock, Wallet, CreditCard, Check } from "lucide-react";
import api, { inr } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const EMPTY_ADDR = { label: "Home", full_name: "", phone: "", line1: "", line2: "", city: "", area: "", pincode: "", is_default: false };

function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function Checkout() {
  const navigate = useNavigate();
  const { location, cart, clearCart, refreshCart } = useStore();
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState(null);
  const [slotDays, setSlotDays] = useState([]);
  const [dayIndex, setDayIndex] = useState(0);
  const [deliveryType, setDeliveryType] = useState("slot");
  const [slotId, setSlotId] = useState(null);
  const [payment, setPayment] = useState("cod");
  const [payConfig, setPayConfig] = useState({ razorpay_enabled: false });
  const [settings, setSettings] = useState({ cod_enabled: true, online_payment_enabled: true });
  const [coupon, setCoupon] = useState("");
  const [couponResult, setCouponResult] = useState(null);
  const [addrOpen, setAddrOpen] = useState(false);
  const [newAddr, setNewAddr] = useState(EMPTY_ADDR);
  const [placing, setPlacing] = useState(false);

  // Use Asia/Kolkata date so requested slots align with backend IST computation.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  useEffect(() => {
    if (!location) return;
    api.get("/addresses").then(({ data }) => {
      const scoped = data.filter((a) => a.location_id === location.id);
      setAddresses(data);
      const def = scoped.find((a) => a.is_default) || scoped[0];
      if (def) setAddressId(def.id);
    });
    api.get(`/delivery/slots/range?location_id=${location.id}&days=4`).then(({ data }) => {
      const days = data.days || [];
      setSlotDays(days);
      const idx = days.findIndex((d) => d.slots.some((s) => s.available));
      if (idx >= 0) {
        setDayIndex(idx);
        const fa = days[idx].slots.find((s) => s.available);
        if (fa) setSlotId(fa.id);
      }
    });
    api.get("/payments/config").then(({ data }) => setPayConfig(data));
    api.get("/settings").then(({ data }) => setSettings(data));
  }, [location, today]);

  if (!location) return null;
  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="font-heading text-2xl">Your cart is empty</p>
        <Button className="mt-4 rounded-full bg-forest" onClick={() => navigate("/products")}>Shop products</Button>
      </div>
    );
  }

  const slotData = slotDays[dayIndex] || { slots: [], asap: {} };
  const asapInfo = slotDays[0]?.asap || {};
  const asapCharge = asapInfo.charge || 0;
  const deliveryCharge = location.delivery_charge || 0;
  const couponDiscount = couponResult?.discount || 0;
  const extra = deliveryType === "asap" ? asapCharge : 0;
  const total = Math.max(0, cart.subtotal - couponDiscount + deliveryCharge + extra);

  const applyCoupon = async () => {
    if (!coupon.trim()) return;
    try {
      const { data } = await api.post("/coupons/validate", { code: coupon, location_id: location.id, subtotal: cart.subtotal });
      setCouponResult(data);
      toast.success(`Coupon applied: -${inr(data.discount)}`);
    } catch (e) {
      setCouponResult(null);
      toast.error(e.response?.data?.detail || "Invalid coupon");
    }
  };

  const saveAddress = async () => {
    try {
      const { data } = await api.post("/addresses", { ...newAddr, location_id: location.id });
      setAddresses((a) => [...a, data]);
      setAddressId(data.id);
      setAddrOpen(false);
      setNewAddr(EMPTY_ADDR);
      toast.success("Address saved");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not save address");
    }
  };

  const placeOrder = async () => {
    if (!addressId) return toast.error("Please add a delivery address");
    if (deliveryType === "slot" && !slotId) return toast.error("Please select a delivery slot");
    setPlacing(true);
    try {
      const { data: order } = await api.post("/orders", {
        location_id: location.id,
        address_id: addressId,
        delivery_type: deliveryType,
        slot_id: deliveryType === "slot" ? slotId : null,
        payment_method: payment,
        coupon_code: couponResult?.code || null,
      });

      if (payment === "razorpay") {
        const ok = await loadRazorpay();
        if (!ok) throw new Error("Failed to load payment SDK");
        const { data: rzp } = await api.post("/payments/razorpay/create-order", { order_id: order.id });
        const options = {
          key: rzp.key_id,
          amount: rzp.amount,
          currency: rzp.currency,
          order_id: rzp.razorpay_order_id,
          name: "Freshly Grocery",
          description: order.order_number,
          handler: async (resp) => {
            try {
              await api.post("/payments/razorpay/verify", resp);
              toast.success("Payment successful!");
              await clearCart();
              navigate(`/orders/${order.id}`);
            } catch {
              toast.error("Payment verification failed");
              navigate(`/orders/${order.id}`);
            }
          },
          prefill: { name: order.customer_name, contact: order.customer_phone },
          theme: { color: "#1B4332" },
        };
        new window.Razorpay(options).open();
        setPlacing(false);
        return;
      }

      toast.success("Order placed successfully!");
      await refreshCart();
      navigate(`/orders/${order.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || "Could not place order");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-bold">Checkout</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Address */}
          <section className="rounded-2xl border border-black/5 bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold">Delivery Address</h2>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setAddrOpen(true)} data-testid="add-address-btn">
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {addresses.filter((a) => a.location_id === location.id).map((a) => (
                <button
                  key={a.id}
                  data-testid={`address-${a.id}`}
                  onClick={() => setAddressId(a.id)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${addressId === a.id ? "border-forest bg-forest-light" : "border-border hover:border-forest/40"}`}
                >
                  <MapPin className="mt-0.5 h-5 w-5 text-forest" />
                  <div className="flex-1">
                    <p className="font-medium">{a.label} · {a.full_name}</p>
                    <p className="text-sm text-muted-foreground">{a.line1}, {a.area && `${a.area}, `}{a.city} - {a.pincode}</p>
                    <p className="text-sm text-muted-foreground">{a.phone}</p>
                  </div>
                  {addressId === a.id && <Check className="h-5 w-5 text-forest" />}
                </button>
              ))}
              {addresses.filter((a) => a.location_id === location.id).length === 0 && (
                <p className="text-sm text-muted-foreground">No address for this location yet. Add one to continue.</p>
              )}
            </div>
          </section>

          {/* Delivery options */}
          <section className="rounded-2xl border border-black/5 bg-white p-6">
            <h2 className="font-heading text-lg font-bold">Delivery Option</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                data-testid="delivery-slot-option"
                onClick={() => setDeliveryType("slot")}
                className={`rounded-xl border p-4 text-left transition-colors ${deliveryType === "slot" ? "border-forest bg-forest-light" : "border-border hover:border-forest/40"}`}
              >
                <div className="flex items-center gap-2"><Clock className="h-5 w-5 text-forest" /><span className="font-medium">Scheduled Slot</span></div>
                <p className="mt-1 text-xs text-muted-foreground">Pick a convenient delivery window</p>
              </button>
              {asapInfo.enabled && (
                <button
                  data-testid="delivery-asap-option"
                  onClick={() => setDeliveryType("asap")}
                  className={`rounded-xl border-2 p-4 text-left transition-colors ${deliveryType === "asap" ? "border-saffron bg-saffron/10" : "border-dashed border-saffron/50 hover:bg-saffron/5"}`}
                >
                  <div className="flex items-center gap-2"><Zap className="h-5 w-5 text-saffron" /><span className="font-medium text-saffron">As Soon As Possible</span></div>
                  <p className="mt-1 text-xs text-muted-foreground">Priority delivery{asapInfo.eta && ` by ~${asapInfo.eta}`} · +{inr(asapCharge)}</p>
                </button>
              )}
            </div>

            {deliveryType === "slot" && (
              <div className="mt-5">
                <div className="mb-3 flex flex-wrap gap-2" data-testid="slot-date-tabs">
                  {slotDays.map((d, i) => {
                    const dt = new Date(`${d.date}T00:00:00`);
                    const lbl = i === 0 ? "Today" : i === 1 ? "Tomorrow" : dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
                    const has = d.slots.some((s) => s.available);
                    return (
                      <button
                        key={d.date}
                        data-testid={`slot-date-${i}`}
                        onClick={() => { setDayIndex(i); const fa = d.slots.find((s) => s.available); setSlotId(fa ? fa.id : null); }}
                        className={`rounded-full border px-4 py-2 text-sm transition-colors ${dayIndex === i ? "border-forest bg-forest text-white" : "border-border bg-white hover:border-forest/40"} ${!has ? "opacity-50" : ""}`}
                      >
                        {lbl}{!has && <span className="ml-1 text-[10px]">(full)</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {slotData.slots.map((s) => (
                    <button
                      key={s.id}
                      data-testid={`slot-${s.id}`}
                      disabled={!s.available}
                      onClick={() => setSlotId(s.id)}
                      className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                        !s.available ? "cursor-not-allowed border-border bg-muted text-muted-foreground/50" :
                        slotId === s.id ? "border-forest bg-forest text-white" : "border-border bg-white hover:border-forest/40"
                      }`}
                    >
                      {s.label}
                      {!s.available && s.reason === "full" && <span className="block text-[10px]">Full</span>}
                    </button>
                  ))}
                  {slotData.slots.filter((s) => s.available).length === 0 && (
                    <p className="col-span-full text-sm text-muted-foreground">No slots available for this day. Pick another date or choose ASAP.</p>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Payment */}
          <section className="rounded-2xl border border-black/5 bg-white p-6">
            <h2 className="font-heading text-lg font-bold">Payment Method</h2>
            <div className="mt-4 space-y-3">
              {settings.cod_enabled && (
                <button data-testid="payment-cod" onClick={() => setPayment("cod")} className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left ${payment === "cod" ? "border-forest bg-forest-light" : "border-border hover:border-forest/40"}`}>
                  <Wallet className="h-5 w-5 text-forest" /><div><p className="font-medium">Cash on Delivery</p><p className="text-xs text-muted-foreground">Pay when your order arrives</p></div>
                  {payment === "cod" && <Check className="ml-auto h-5 w-5 text-forest" />}
                </button>
              )}
              {settings.online_payment_enabled && (
                <button
                  data-testid="payment-razorpay"
                  onClick={() => payConfig.razorpay_enabled ? setPayment("razorpay") : toast.error("Online payment not configured yet")}
                  className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left ${payment === "razorpay" ? "border-forest bg-forest-light" : "border-border hover:border-forest/40"} ${!payConfig.razorpay_enabled ? "opacity-60" : ""}`}
                >
                  <CreditCard className="h-5 w-5 text-forest" />
                  <div><p className="font-medium">Pay Online (Razorpay)</p><p className="text-xs text-muted-foreground">{payConfig.razorpay_enabled ? "UPI, cards, netbanking & wallets" : "Not configured — add Razorpay keys"}</p></div>
                  {payment === "razorpay" && <Check className="ml-auto h-5 w-5 text-forest" />}
                </button>
              )}
            </div>
          </section>
        </div>

        {/* Summary */}
        <div>
          <div className="sticky top-24 rounded-2xl border border-black/5 bg-white p-6">
            <h2 className="font-heading text-lg font-bold">Order Summary</h2>
            <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
              {cart.items.map((i) => (
                <div key={i.product_id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{i.name} × {i.quantity}</span>
                  <span>{inr(i.line_total)}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <Input data-testid="coupon-input" placeholder="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} className="rounded-full" />
              <Button variant="outline" className="rounded-full" onClick={applyCoupon} data-testid="apply-coupon">Apply</Button>
            </div>

            <div className="mt-4 space-y-1 border-t pt-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{inr(cart.subtotal)}</span></div>
              {couponDiscount > 0 && <div className="flex justify-between text-forest"><span>Coupon</span><span>-{inr(couponDiscount)}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{inr(deliveryCharge)}</span></div>
              {deliveryType === "asap" && <div className="flex justify-between text-saffron"><span>Priority (ASAP)</span><span>+{inr(asapCharge)}</span></div>}
              <div className="flex justify-between pt-2 text-lg font-bold"><span>Total</span><span data-testid="order-total">{inr(total)}</span></div>
            </div>

            <Button data-testid="place-order-btn" disabled={placing} onClick={placeOrder} className="mt-5 w-full rounded-full bg-forest py-6 hover:bg-forest-dark">
              {placing ? "Placing…" : payment === "razorpay" ? `Pay ${inr(total)}` : `Place Order · ${inr(total)}`}
            </Button>
          </div>
        </div>
      </div>

      {/* Add address dialog */}
      <Dialog open={addrOpen} onOpenChange={setAddrOpen}>
        <DialogContent className="sm:max-w-md" data-testid="address-dialog">
          <DialogHeader><DialogTitle className="font-heading">Add delivery address</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Label (Home/Work)" value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} />
              <Input placeholder="Full name" data-testid="addr-name" value={newAddr.full_name} onChange={(e) => setNewAddr({ ...newAddr, full_name: e.target.value })} />
            </div>
            <Input placeholder="Phone" data-testid="addr-phone" value={newAddr.phone} onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })} />
            <Input placeholder="Address line 1" data-testid="addr-line1" value={newAddr.line1} onChange={(e) => setNewAddr({ ...newAddr, line1: e.target.value })} />
            <Input placeholder="Address line 2 (optional)" value={newAddr.line2} onChange={(e) => setNewAddr({ ...newAddr, line2: e.target.value })} />
            <div className="grid grid-cols-3 gap-3">
              <Input placeholder="Area" value={newAddr.area} onChange={(e) => setNewAddr({ ...newAddr, area: e.target.value })} />
              <Input placeholder="City" data-testid="addr-city" value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} />
              <Input placeholder="Pincode" data-testid="addr-pincode" value={newAddr.pincode} onChange={(e) => setNewAddr({ ...newAddr, pincode: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button className="rounded-full bg-forest" onClick={saveAddress} data-testid="save-address-btn">Save address</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
