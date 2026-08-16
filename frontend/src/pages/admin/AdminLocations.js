import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, MapPin } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const EMPTY = { name: "", city: "", area: "", is_active: true, delivery_available: true, delivery_charge: 0, min_order_value: 0, pincodes: [] };

export default function AdminLocations() {
  const [locs, setLocs] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [pinStr, setPinStr] = useState("");

  const load = () => api.get("/admin/locations").then(({ data }) => setLocs(data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const payload = { ...form, delivery_charge: Number(form.delivery_charge), min_order_value: Number(form.min_order_value), pincodes: pinStr.split(",").map((s) => s.trim()).filter(Boolean) };
    try {
      if (editing) await api.put(`/admin/locations/${editing.id}`, payload);
      else await api.post("/admin/locations", payload);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Locations</h1><p className="text-sm text-slate-500">Multi-location service areas</p></div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={() => { setEditing(null); setForm(EMPTY); setPinStr(""); setOpen(true); }} data-testid="add-location-btn"><Plus className="mr-1 h-4 w-4" />Add Location</Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {locs.map((l) => (
          <div key={l.id} className="rounded-xl border bg-white p-5" data-testid={`location-card-${l.id}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-forest" /><div><p className="font-medium">{l.name}</p><p className="text-xs text-slate-400">{l.area}, {l.city}</p></div></div>
              <button onClick={() => { setEditing(l); setForm(l); setPinStr((l.pincodes || []).join(", ")); setOpen(true); }} data-testid={`edit-location-${l.id}`}><Pencil className="h-4 w-4 text-slate-500 hover:text-forest" /></button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {l.is_active ? <Badge className="bg-forest-light text-forest">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
              {l.delivery_available && <Badge variant="outline">Delivery on</Badge>}
            </div>
            <p className="mt-3 text-sm text-slate-500">Delivery {inr(l.delivery_charge)} · Min order {inr(l.min_order_value)}</p>
            <p className="text-xs text-slate-400">Pincodes: {(l.pincodes || []).join(", ") || "-"}</p>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Location</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name</Label><Input data-testid="location-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><Label>Area</Label><Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Delivery charge</Label><Input type="number" value={form.delivery_charge} onChange={(e) => setForm({ ...form, delivery_charge: e.target.value })} /></div>
              <div><Label>Min order value</Label><Input type="number" value={form.min_order_value} onChange={(e) => setForm({ ...form, min_order_value: e.target.value })} /></div>
            </div>
            <div><Label>Pincodes (comma separated)</Label><Input value={pinStr} onChange={(e) => setPinStr(e.target.value)} /></div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Active</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.delivery_available} onCheckedChange={(v) => setForm({ ...form, delivery_available: v })} />Delivery available</label>
            </div>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-location-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
