import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EMPTY = {
  pincode: "", location_id: "", area_name: "", is_serviceable: true, asap_enabled: true,
  min_order_value: 0, delivery_charge: "", free_delivery_threshold: "", discount_type: "none",
  discount_value: 0, max_discount: "", notes: "",
};

export default function AdminPinCodes() {
  const [pins, setPins] = useState([]);
  const [locs, setLocs] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = () => {
    api.get("/admin/pincodes").then(({ data }) => setPins(data));
    api.get("/admin/locations").then(({ data }) => setLocs(data));
  };
  useEffect(() => { load(); }, []);

  const locName = (id) => locs.find((l) => l.id === id)?.name || "—";

  const save = async () => {
    if (!form.location_id) { toast.error("Select a parent location"); return; }
    const payload = {
      ...form,
      min_order_value: Number(form.min_order_value) || 0,
      delivery_charge: form.delivery_charge === "" ? null : Number(form.delivery_charge),
      free_delivery_threshold: form.free_delivery_threshold === "" ? null : Number(form.free_delivery_threshold),
      discount_type: form.discount_type === "none" ? null : form.discount_type,
      discount_value: Number(form.discount_value) || 0,
      max_discount: form.max_discount === "" ? null : Number(form.max_discount),
    };
    try {
      if (editing) await api.put(`/admin/pincodes/${editing.id}`, payload);
      else await api.post("/admin/pincodes", payload);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };
  const del = async (id) => { await api.delete(`/admin/pincodes/${id}`); load(); };

  return (
    <div data-testid="admin-pincodes">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">PIN Code Serviceability</h1><p className="text-sm text-slate-500">{pins.length} PIN codes</p></div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }} data-testid="add-pincode-btn"><Plus className="mr-1 h-4 w-4" />Add PIN Code</Button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">PIN</th><th className="p-3">Parent Location</th><th className="p-3">Min Order</th><th className="p-3">Delivery</th><th className="p-3">Discount</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>
            {pins.map((p) => (
              <tr key={p.id} className="border-t" data-testid={`pincode-row-${p.id}`}>
                <td className="p-3 font-medium">{p.pincode}</td>
                <td className="p-3 text-slate-600">{locName(p.location_id)}</td>
                <td className="p-3">{inr(p.min_order_value)}</td>
                <td className="p-3">{p.delivery_charge == null ? "Default" : inr(p.delivery_charge)}</td>
                <td className="p-3">{p.discount_type ? `${p.discount_value}${p.discount_type === "percentage" ? "%" : "₹"}` : "—"}</td>
                <td className="p-3">{p.is_serviceable ? <Badge className="bg-forest-light text-forest">Serviceable</Badge> : <Badge variant="secondary">Not serviceable</Badge>}</td>
                <td className="p-3 text-right">
                  <button className="mr-3" onClick={() => { setEditing(p); setForm({ ...p, delivery_charge: p.delivery_charge ?? "", free_delivery_threshold: p.free_delivery_threshold ?? "", asap_enabled: p.asap_enabled ?? true, discount_type: p.discount_type || "none", max_discount: p.max_discount ?? "" }); setOpen(true); }} data-testid={`edit-pincode-${p.id}`}><Pencil className="h-4 w-4 text-slate-500 hover:text-forest" /></button>
                  <button onClick={() => del(p.id)} data-testid={`delete-pincode-${p.id}`}><Trash2 className="h-4 w-4 text-slate-500 hover:text-destructive" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} PIN Code</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>PIN code</Label><Input data-testid="pincode-value" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></div>
              <div><Label>Area name</Label><Input value={form.area_name} onChange={(e) => setForm({ ...form, area_name: e.target.value })} /></div>
            </div>
            <div>
              <Label>Parent location</Label>
              <Select value={form.location_id || ""} onValueChange={(v) => setForm({ ...form, location_id: v })}>
                <SelectTrigger data-testid="pincode-location"><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>{locs.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Min order value (₹)</Label><Input type="number" value={form.min_order_value} onChange={(e) => setForm({ ...form, min_order_value: e.target.value })} /></div>
              <div><Label>Delivery charge (₹)</Label><Input type="number" placeholder="Default" value={form.delivery_charge} onChange={(e) => setForm({ ...form, delivery_charge: e.target.value })} /></div>
            </div>
            <div>
              <Label>PIN-specific discount</Label>
              <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v })}>
                <SelectTrigger data-testid="pincode-discount-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.discount_type !== "none" && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Discount value</Label><Input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} /></div>
                <div><Label>Max discount (₹)</Label><Input type="number" value={form.max_discount} onChange={(e) => setForm({ ...form, max_discount: e.target.value })} /></div>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_serviceable} onCheckedChange={(v) => setForm({ ...form, is_serviceable: v })} data-testid="pincode-serviceable" />Serviceable</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.asap_enabled} onCheckedChange={(v) => setForm({ ...form, asap_enabled: v })} data-testid="pincode-asap" />ASAP delivery available</label>
            <div><Label>Free delivery above (₹)</Label><Input type="number" data-testid="pincode-free-threshold" placeholder="Optional" value={form.free_delivery_threshold} onChange={(e) => setForm({ ...form, free_delivery_threshold: e.target.value })} /></div>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-pincode-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
