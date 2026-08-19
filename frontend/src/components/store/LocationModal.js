import { useState } from "react";
import { MapPin, Check, Search, X } from "lucide-react";
import { toast } from "sonner";
import api, { inr } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LocationModal() {
  const { locations, location, setLocation, locationModalOpen, setLocationModalOpen } = useStore();
  const [pin, setPin] = useState("");
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);

  const checkPin = async () => {
    if (pin.trim().length < 4) { toast.error("Enter a valid PIN code"); return; }
    setChecking(true);
    try {
      const { data } = await api.get(`/pincodes/check?pincode=${pin.trim()}`);
      setResult(data);
    } catch { toast.error("Could not check PIN code"); }
    finally { setChecking(false); }
  };

  const useServiceableLocation = () => {
    if (result?.serviceable && result.location) {
      setLocation(result.location, result.pincode);
      toast.success(`Delivering to ${result.location.name} (${result.pincode})`);
    }
  };

  return (
    <Dialog open={locationModalOpen} onOpenChange={setLocationModalOpen}>
      <DialogContent className="sm:max-w-md" data-testid="location-modal">
        <DialogHeader><DialogTitle className="font-heading text-2xl">Where should we deliver?</DialogTitle></DialogHeader>

        <div className="rounded-2xl bg-cream p-4">
          <p className="text-sm font-medium">Check your PIN code</p>
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input data-testid="pincode-check-input" value={pin} maxLength={6} placeholder="e.g. 500034"
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setResult(null); }}
                onKeyDown={(e) => e.key === "Enter" && checkPin()} className="rounded-full pl-9" />
            </div>
            <Button className="rounded-full bg-forest hover:bg-forest-dark" onClick={checkPin} disabled={checking} data-testid="pincode-check-btn">{checking ? "…" : "Check"}</Button>
          </div>

          {result && (result.serviceable ? (
            <div className="mt-3 rounded-xl border border-forest/30 bg-white p-3 text-sm" data-testid="pincode-serviceable">
              <p className="flex items-center gap-1 font-semibold text-forest"><Check className="h-4 w-4" />We deliver to {result.pincode}!</p>
              <p className="mt-1 text-muted-foreground">{result.location.name} · Min order {inr(result.min_order_value)} · Delivery {result.delivery_charge > 0 ? inr(result.delivery_charge) : "FREE"}</p>
              {result.discount_type && <p className="text-forest">Extra {result.discount_type === "percentage" ? `${result.discount_value}%` : inr(result.discount_value)} off for your area!</p>}
              <Button size="sm" className="mt-2 w-full rounded-full bg-forest hover:bg-forest-dark" onClick={useServiceableLocation} data-testid="use-pincode-location">Shop this area</Button>
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1 rounded-xl border border-red-200 bg-white p-3 text-sm text-red-600" data-testid="pincode-not-serviceable"><X className="h-4 w-4" />Sorry, we don't deliver to {result.pincode} yet.</p>
          ))}
        </div>

        <p className="mt-2 text-sm text-muted-foreground">Or pick a service area:</p>
        <div className="space-y-2">
          {locations.map((loc) => (
            <button key={loc.id} data-testid={`select-location-${loc.id}`} onClick={() => setLocation(loc)}
              className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors ${location?.id === loc.id ? "border-forest bg-forest-light" : "border-border hover:border-forest/40"}`}>
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-forest" />
                <div><p className="font-medium">{loc.name}</p><p className="text-xs text-muted-foreground">{loc.area}, {loc.city}</p></div>
              </div>
              {location?.id === loc.id && <Check className="h-5 w-5 text-forest" />}
            </button>
          ))}
          {locations.length === 0 && <p className="text-sm text-muted-foreground">No active service areas yet.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
