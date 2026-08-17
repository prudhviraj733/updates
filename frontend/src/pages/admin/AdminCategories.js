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

const EMPTY = { name: "", description: "", image_url: "", parent_id: null, display_order: 0, is_active: true };

export default function AdminCategories() {
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = () => api.get("/admin/categories").then(({ data }) => setCats(data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const payload = { ...form, display_order: Number(form.display_order) };
    try {
      if (editing) await api.put(`/admin/categories/${editing.id}`, payload);
      else await api.post("/admin/categories", payload);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };
  const del = async (id) => { await api.delete(`/admin/categories/${id}`); load(); };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Categories</h1><p className="text-sm text-slate-500">{cats.length} categories</p></div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={() => { setEditing(null); setForm({ ...EMPTY, display_order: cats.length }); setOpen(true); }} data-testid="add-category-btn"><Plus className="mr-1 h-4 w-4" />Add Category</Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cats.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border bg-white p-4" data-testid={`category-card-${c.id}`}>
            <img src={c.image_url || "https://via.placeholder.com/64?text=Cat"} alt="" className="h-12 w-12 rounded-lg object-cover bg-slate-100" />
            <div className="flex-1">
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-slate-400">Order {c.display_order} {c.is_active ? "" : "· inactive"}</p>
            </div>
            {c.is_active && <Badge className="bg-forest-light text-forest">Active</Badge>}
            <button onClick={() => { setEditing(c); setForm(c); setOpen(true); }} data-testid={`edit-category-${c.id}`}><Pencil className="h-4 w-4 text-slate-500 hover:text-forest" /></button>
            <button onClick={() => del(c.id)} data-testid={`delete-category-${c.id}`}><Trash2 className="h-4 w-4 text-slate-500 hover:text-destructive" /></button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Category</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name</Label><Input data-testid="category-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div>
              <div className="flex items-center justify-between"><Label>Category image</Label><ImageUpload onUploaded={(url) => setForm((f) => ({ ...f, image_url: url }))} /></div>
              <Input className="mt-1" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="Upload or paste image URL" />
              {form.image_url && <img src={form.image_url} className="mt-2 h-16 w-16 rounded border object-cover" alt="" />}
            </div>
            <div><Label>Display order</Label><Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Active</label>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-category-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
