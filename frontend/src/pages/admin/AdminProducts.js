import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const EMPTY = {
  name: "", description: "", category_id: "", images: [], pack_size: "", unit: "",
  mrp: 0, selling_price: 0, sku: "", is_active: true, is_featured: false, location_ids: [],
};

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [imageStr, setImageStr] = useState("");

  const load = () => api.get("/admin/products").then(({ data }) => setProducts(data));
  useEffect(() => {
    load();
    api.get("/categories").then(({ data }) => setCategories(data));
    api.get("/admin/locations").then(({ data }) => setLocations(data));
  }, []);

  const openNew = () => { setEditing(null); setForm({ ...EMPTY, category_id: categories[0]?.id || "", location_ids: locations.map((l) => l.id) }); setImageStr(""); setOpen(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...p }); setImageStr((p.images || []).join(", ")); setOpen(true); };

  const save = async () => {
    const payload = {
      ...form,
      mrp: Number(form.mrp), selling_price: Number(form.selling_price),
      images: imageStr.split(",").map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (editing) await api.put(`/admin/products/${editing.id}`, payload);
      else await api.post("/admin/products", payload);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const del = async (id) => { await api.delete(`/admin/products/${id}`); toast.success("Deactivated"); load(); };
  const toggleLoc = (id) => setForm((f) => ({ ...f, location_ids: f.location_ids.includes(id) ? f.location_ids.filter((x) => x !== id) : [...f.location_ids, id] }));
  const catName = (id) => categories.find((c) => c.id === id)?.name || "-";

  return (
    <div>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Products</h1><p className="text-sm text-slate-500">{products.length} products</p></div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={openNew} data-testid="add-product-btn"><Plus className="mr-1 h-4 w-4" />Add Product</Button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Product</th><th className="px-4 py-2">Category</th><th className="px-4 py-2">Price</th><th className="px-4 py-2">Stock</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t" data-testid={`product-row-${p.id}`}>
                <td className="px-4 py-2"><div className="flex items-center gap-2"><img src={p.images?.[0]} className="h-9 w-9 rounded object-cover" alt="" /><div><p className="font-medium">{p.name}</p><p className="text-xs text-slate-400">{p.sku} · {p.pack_size}</p></div></div></td>
                <td className="px-4 py-2">{catName(p.category_id)}</td>
                <td className="px-4 py-2">{inr(p.selling_price)} <span className="text-xs text-slate-400 line-through">{inr(p.mrp)}</span></td>
                <td className="px-4 py-2">{p.stock ?? "-"}</td>
                <td className="px-4 py-2"><div className="flex gap-1">{p.is_active ? <Badge className="bg-forest-light text-forest">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}{p.is_featured && <Badge className="bg-saffron/15 text-saffron">Featured</Badge>}</div></td>
                <td className="px-4 py-2"><div className="flex gap-2"><button onClick={() => openEdit(p)} data-testid={`edit-product-${p.id}`}><Pencil className="h-4 w-4 text-slate-500 hover:text-forest" /></button><button onClick={() => del(p.id)} data-testid={`delete-product-${p.id}`}><Trash2 className="h-4 w-4 text-slate-500 hover:text-destructive" /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="product-dialog">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Product</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name</Label><Input data-testid="product-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><select className="w-full rounded-md border p-2" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Pack size</Label><Input value={form.pack_size} onChange={(e) => setForm({ ...form, pack_size: e.target.value })} /></div>
              <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>MRP</Label><Input type="number" data-testid="product-mrp" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} /></div>
              <div><Label>Selling price</Label><Input type="number" data-testid="product-price" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} /></div>
            </div>
            <div><Label>Image URLs (comma separated)</Label><Textarea value={imageStr} onChange={(e) => setImageStr(e.target.value)} placeholder="https://…" /></div>
            <div><Label>Available at locations</Label>
              <div className="mt-1 flex flex-wrap gap-2">{locations.map((l) => <button key={l.id} onClick={() => toggleLoc(l.id)} className={`rounded-full border px-3 py-1 text-xs ${form.location_ids.includes(l.id) ? "border-forest bg-forest text-white" : "border-slate-300"}`}>{l.name}</button>)}</div>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Active</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_featured} onCheckedChange={(v) => setForm({ ...form, is_featured: v })} />Featured</label>
            </div>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-product-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
