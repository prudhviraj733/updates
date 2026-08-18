import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ImageUpload } from "@/components/admin/ImageUpload";

const EMPTY = { name: "", description: "", logo_url: "", display_order: 0, is_active: true };

export default function AdminBrands() {
  const [brands, setBrands] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = () => api.get("/admin/brands").then(({ data }) => setBrands(data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const payload = { ...form, display_order: Number(form.display_order) };
    try {
      if (editing) await api.put(`/admin/brands/${editing.id}`, payload);
      else await api.post("/admin/brands", payload);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };
  const del = async (id) => { await api.delete(`/admin/brands/${id}`); load(); };

  return (
    <div data-testid="admin-brands">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Brands</h1><p className="text-sm text-slate-500">{brands.length} brands</p></div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={() => { setEditing(null); setForm({ ...EMPTY, display_order: brands.length }); setOpen(true); }} data-testid="add-brand-btn"><Plus className="mr-1 h-4 w-4" />Add Brand</Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {brands.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-xl border bg-white p-4" data-testid={`brand-card-${b.id}`}>
            <img src={b.logo_url || "https://via.placeholder.com/64?text=Brand"} alt="" className="h-12 w-12 rounded-lg object-contain bg-slate-100" />
            <div className="flex-1">
              <p className="font-medium">{b.name}</p>
              <p className="text-xs text-slate-400">Order {b.display_order} {b.is_active ? "" : "· inactive"}</p>
            </div>
            {b.is_active && <Badge className="bg-forest-light text-forest">Active</Badge>}
            <button onClick={() => { setEditing(b); setForm(b); setOpen(true); }} data-testid={`edit-brand-${b.id}`}><Pencil className="h-4 w-4 text-slate-500 hover:text-forest" /></button>
            <button onClick={() => del(b.id)} data-testid={`delete-brand-${b.id}`}><Trash2 className="h-4 w-4 text-slate-500 hover:text-destructive" /></button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Brand</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name</Label><Input data-testid="brand-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div>
              <div className="flex items-center justify-between"><Label>Brand logo</Label><ImageUpload onUploaded={(url) => setForm((f) => ({ ...f, logo_url: url }))} /></div>
              <Input className="mt-1" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="Upload or paste logo URL" />
              {form.logo_url && <img src={form.logo_url} className="mt-2 h-16 w-16 rounded border object-contain" alt="" />}
            </div>
            <div><Label>Display order</Label><Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Active</label>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-brand-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
