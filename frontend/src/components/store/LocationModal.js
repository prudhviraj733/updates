import { MapPin, Check } from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function LocationModal() {
  const { locations, location, setLocation, locationModalOpen, setLocationModalOpen } = useStore();

  return (
    <Dialog open={locationModalOpen} onOpenChange={setLocationModalOpen}>
      <DialogContent className="sm:max-w-md" data-testid="location-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">Select your location</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          We deliver fresh groceries to these service areas. Pick where you'd like your order delivered.
        </p>
        <div className="mt-2 space-y-2">
          {locations.map((loc) => (
            <button
              key={loc.id}
              data-testid={`select-location-${loc.id}`}
              onClick={() => setLocation(loc)}
              className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors ${
                location?.id === loc.id ? "border-forest bg-forest-light" : "border-border hover:border-forest/40"
              }`}
            >
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-forest" />
                <div>
                  <p className="font-medium">{loc.name}</p>
                  <p className="text-xs text-muted-foreground">{loc.area}, {loc.city}</p>
                </div>
              </div>
              {location?.id === loc.id && <Check className="h-5 w-5 text-forest" />}
            </button>
          ))}
          {locations.length === 0 && (
            <p className="text-sm text-muted-foreground">No active service areas yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
