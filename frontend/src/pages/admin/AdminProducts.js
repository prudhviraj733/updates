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
import { ImageUpload } from "@/components/admin/ImageUpload";

const EMPTY = {
  name: "", description: "", category_id: "", subcategory_id: null, subsubcategory_id: null, brand_id: null, images: [], pack_size: "", unit: "",
  mrp: 0, selling_price: 0, cost_price: 0, gst_rate: 0, sku: "", is_active: true, is_featured: false, location_ids: [],
};

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [subsubcategories, setSubsubcategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [filterCat, setFilterCat] = useState("");
  const [filterSub, setFilterSub] = useState("");
  const [filterSubsub, setFilterSubsub] = useState("");
  const [locations, setLocations] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [imageStr, setImageStr] = useState("");

  const load = () => api.get("/admin/products").then(({ data }) => setProducts(data));
  useEffect(() => {
    load();
    api.get("/admin/categories").then(({ data }) => setCategories(data));
    api.get("/admin/subcategories").then(({ data }) => setSubcategories(data));
    api.get("/admin/subsubcategories").then(({ data }) => setSubsubcategories(data));
    api.get("/admin/brands").then(({ data }) => setBrands(data));
    api.get("/admin/locations").then(({ data }) => setLocations(data));
  }, []);

  const openNew = () => { setEditing(null); setForm({ ...EMPTY, category_id: categories[0]?.id || "", location_ids: locations.map((l) => l.id) }); setImageStr(""); setOpen(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...p, subcategory_id: p.subcategory_id || null, subsubcategory_id: p.subsubcategory_id || null, brand_id: p.brand_id || null }); setImageStr((p.images || []).join(", ")); setOpen(true); };

  const save = async () => {
    if (!form.subcategory_id) { toast.error("Please select a subcategory"); return; }
    const payload = {
      ...form,
      mrp: Number(form.mrp), selling_price: Number(form.selling_price), cost_price: Number(form.cost_price) || 0, gst_rate: Number(form.gst_rate) || 0,
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
  const subName = (id) => subcategories.find((s) => s.id === id)?.name;
  const subsubName = (id) => subsubcategories.find((s) => s.id === id)?.name;
  const activeOnly = (arr) => arr.filter((x) => x.is_active !== false);
  const subsForCat = activeOnly(subcategories.filter((s) => s.parent_id === form.category_id));
  const subsubsForSub = activeOnly(subsubcategories.filter((ss) => ss.parent_id === form.subcategory_id));
  const filterSubs = activeOnly(subcategories.filter((s) => s.parent_id === filterCat));
  const filterSubsubs = activeOnly(subsubcategories.filter((ss) => ss.parent_id === filterSub));
  const filteredProducts = products.filter((p) => {
    if (filterCat && p.category_id !== filterCat) return false;
    if (filterSub && p.subcategory_id !== filterSub) return false;
    if (filterSubsub && p.subsubcategory_id !== filterSubsub) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Products</h1><p className="text-sm text-slate-500">{filteredProducts.length} of {products.length} products</p></div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={openNew} data-testid="add-product-btn"><Plus className="mr-1 h-4 w-4" />Add Product</Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="product-filters">
        <select className="rounded-md border p-2 text-sm" data-testid="filter-category" value={filterCat} onChange={(e) => { setFilterCat(e.target.value); setFilterSub(""); setFilterSubsub(""); }}>
          <option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="rounded-md border p-2 text-sm" data-testid="filter-subcategory" value={filterSub} disabled={!filterCat} onChange={(e) => { setFilterSub(e.target.value); setFilterSubsub(""); }}>
          <option value="">All subcategories</option>{filterSubs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="rounded-md border p-2 text-sm" data-testid="filter-subsubcategory" value={filterSubsub} disabled={!filterSub} onChange={(e) => setFilterSubsub(e.target.value)}>
          <option value="">All sub-subcategories</option>{filterSubsubs.map((ss) => <option key={ss.id} value={ss.id}>{ss.name}</option>)}
        </select>
        {(filterCat || filterSub || filterSubsub) && <button className="text-xs font-medium text-forest hover:underline" data-testid="filter-clear" onClick={() => { setFilterCat(""); setFilterSub(""); setFilterSubsub(""); }}>Clear</button>}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Product</th><th className="px-4 py-2">Category</th><th className="px-4 py-2">Price</th><th className="px-4 py-2">Stock</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {filteredProducts.map((p) => (
              <tr key={p.id} className="border-t" data-testid={`product-row-${p.id}`}>
                <td className="px-4 py-2"><div className="flex items-center gap-2"><img src={p.images?.[0]} className="h-9 w-9 rounded object-cover" alt="" /><div><p className="font-medium">{p.name}</p><p className="text-xs text-slate-400">{p.sku} · {p.pack_size}</p></div></div></td>
                <td className="px-4 py-2"><div className="text-xs leading-tight"><span className="font-medium text-slate-700">{catName(p.category_id)}</span>{p.subcategory_id && <span className="text-slate-400"> › {subName(p.subcategory_id)}</span>}{p.subsubcategory_id && <span className="text-slate-400"> › {subsubName(p.subsubcategory_id)}</span>}</div></td>
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
              <div><Label>Category</Label><select className="w-full rounded-md border p-2" data-testid="product-category" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value, subcategory_id: null, subsubcategory_id: null })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><Label>Subcategory</Label><select className="w-full rounded-md border p-2" data-testid="product-subcategory" value={form.subcategory_id || ""} onChange={(e) => setForm({ ...form, subcategory_id: e.target.value || null, subsubcategory_id: null })}><option value="">Select…</option>{subsForCat.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            </div>
            {subsubsForSub.length > 0 && (
              <div><Label>Sub-subcategory (optional)</Label><select className="w-full rounded-md border p-2" data-testid="product-subsubcategory" value={form.subsubcategory_id || ""} onChange={(e) => setForm({ ...form, subsubcategory_id: e.target.value || null })}><option value="">None</option>{subsubsForSub.map((ss) => <option key={ss.id} value={ss.id}>{ss.name}</option>)}</select></div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Brand</Label><select className="w-full rounded-md border p-2" data-testid="product-brand" value={form.brand_id || ""} onChange={(e) => setForm({ ...form, brand_id: e.target.value || null })}><option value="">No brand</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
              <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Pack size</Label><Input value={form.pack_size} onChange={(e) => setForm({ ...form, pack_size: e.target.value })} /></div>
              <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>MRP</Label><Input type="number" data-testid="product-mrp" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} /></div>
              <div><Label>Selling price</Label><Input type="number" data-testid="product-price" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} /></div>
              <div><Label>Cost price</Label><Input type="number" data-testid="product-cost" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></div>
              <div><Label>GST rate %</Label><select className="w-full rounded-md border p-2" data-testid="product-gst" value={form.gst_rate ?? 0} onChange={(e) => setForm({ ...form, gst_rate: e.target.value })}><option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option></select></div>
            </div>
            <div>
              <div className="flex items-center justify-between"><Label>Product images</Label><ImageUpload onUploaded={(url) => setImageStr((s) => (s ? `${s}, ${url}` : url))} /></div>
              <Textarea className="mt-1" value={imageStr} onChange={(e) => setImageStr(e.target.value)} placeholder="Upload or paste image URLs (comma separated)" />
              {imageStr && <div className="mt-2 flex flex-wrap gap-2">{imageStr.split(",").map((s) => s.trim()).filter(Boolean).map((u, i) => <img key={i} src={u} className="h-12 w-12 rounded border object-cover" alt="" />)}</div>}
            </div>
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
