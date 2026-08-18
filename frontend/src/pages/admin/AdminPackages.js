import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Gift } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const EMPTY = { name: "", description: "", image_url: "", package_type: "bundle", product_ids: [], swap_options: {}, price: 0, is_active: true, location_ids: [] };

export default function AdminPackages() {
  const [packages, setPackages] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [swapFor, setSwapFor] = useState(null);

  const load = () => api.get("/admin/packages").then(({ data }) => setPackages(data));
  useEffect(() => { load(); api.get("/admin/products").then(({ data }) => setProducts(data)); api.get("/admin/locations").then(({ data }) => setLocations(data)); }, []);

  const save = async () => {
    try { await api.post("/admin/packages", { ...form, price: Number(form.price), location_ids: locations.map((l) => l.id) }); toast.success("Saved"); setOpen(false); load(); }
    catch (e) { toast.error("Error"); }
  };
  const del = async (id) => { await api.delete(`/admin/packages/${id}`); load(); };
  const toggleProduct = (id) => setForm((f) => {
    const has = f.product_ids.includes(id);
    const swap_options = { ...f.swap_options };
    if (has) delete swap_options[id];
    return { ...f, product_ids: has ? f.product_ids.filter((x) => x !== id) : [...f.product_ids, id], swap_options };
  });
  const pName = (id) => products.find((p) => p.id === id)?.name || id;
  const toggleAlt = (origId, altId) => setForm((f) => {
    const cur = f.swap_options[origId] || [];
    const next = cur.includes(altId) ? cur.filter((x) => x !== altId) : [...cur, altId];
    return { ...f, swap_options: { ...f.swap_options, [origId]: next } };
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Packages & Bundles</h1><p className="text-sm text-slate-500">Grocery bundles and monthly packages</p></div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={() => { setForm(EMPTY); setOpen(true); }} data-testid="add-package-btn"><Plus className="mr-1 h-4 w-4" />Add Package</Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) => (
          <div key={p.id} className="rounded-xl border bg-white p-5" data-testid={`package-card-${p.id}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2"><Gift className="h-5 w-5 text-forest" /><p className="font-medium">{p.name}</p></div>
              <button onClick={() => del(p.id)}><Trash2 className="h-4 w-4 text-slate-500 hover:text-destructive" /></button>
            </div>
            <p className="mt-2 text-sm text-slate-500">{p.description}</p>
            <div className="mt-2 flex items-center gap-2"><Badge variant="outline" className="capitalize">{p.package_type}</Badge><span className="font-bold text-forest">{inr(p.price)}</span></div>
            <p className="mt-1 text-xs text-slate-400">{p.product_ids?.length || 0} products</p>
          </div>
        ))}
        {packages.length === 0 && <p className="text-sm text-slate-400">No packages yet. The architecture supports bundles & monthly packages.</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader><DialogTitle>Add Package</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name</Label><Input data-testid="package-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label><select className="w-full rounded-md border p-2" value={form.package_type} onChange={(e) => setForm({ ...form, package_type: e.target.value })}><option value="bundle">Bundle</option><option value="monthly">Monthly</option><option value="promotional">Promotional</option></select></div>
              <div><Label>Price</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            </div>
            <div><Label>Products &amp; approved swaps</Label>
              <div className="mt-1 max-h-60 space-y-1 overflow-y-auto rounded border p-2">
                {products.map((p) => (
                  <div key={p.id}>
                    <div className="flex items-center justify-between text-sm">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={form.product_ids.includes(p.id)} onChange={() => toggleProduct(p.id)} data-testid={`pkg-prod-${p.id}`} />{p.name}</label>
                      {form.product_ids.includes(p.id) && (
                        <button type="button" onClick={() => setSwapFor(swapFor === p.id ? null : p.id)} className="text-xs text-forest hover:underline" data-testid={`pkg-swapcfg-${p.id}`}>
                          swaps ({(form.swap_options[p.id] || []).length})
                        </button>
                      )}
                    </div>
                    {swapFor === p.id && (
                      <div className="ml-6 mt-1 max-h-32 space-y-1 overflow-y-auto rounded bg-slate-50 p-2">
                        <p className="text-xs text-slate-400">Approved alternatives customers may swap to:</p>
                        {products.filter((a) => a.id !== p.id).map((a) => (
                          <label key={a.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={(form.swap_options[p.id] || []).includes(a.id)} onChange={() => toggleAlt(p.id, a.id)} data-testid={`pkg-alt-${p.id}-${a.id}`} />{a.name}</label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {Object.keys(form.swap_options).some((k) => (form.swap_options[k] || []).length) && (
                <p className="mt-1 text-xs text-slate-400">Swaps configured for: {Object.keys(form.swap_options).filter((k) => (form.swap_options[k] || []).length).map(pName).join(", ")}</p>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Active</label>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-package-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
