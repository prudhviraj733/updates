import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, GripVertical, Eye, EyeOff } from "lucide-react";
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
  package_id: "", title: "", subtitle: "", promo_text: "", cta_text: "View Combo",
  image_url: "", display_order: 0, is_active: true, location_ids: [],
};

export default function AdminComboBanners() {
  const [banners, setBanners] = useState([]);
  const [packages, setPackages] = useState([]);
  const [locations, setLocations] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = () => api.get("/admin/combo-banners").then(({ data }) => setBanners(data));
  useEffect(() => {
    load();
    api.get("/admin/packages").then(({ data }) => setPackages(data));
    api.get("/admin/locations").then(({ data }) => setLocations(data));
  }, []);

  const openNew = () => { setEditing(null); setForm({ ...EMPTY, display_order: banners.length }); setOpen(true); };
  const openEdit = (b) => { setEditing(b); setForm({ ...EMPTY, ...b }); setOpen(true); };

  const onSelectPackage = (pid) => {
    const pkg = packages.find((p) => p.id === pid);
    setForm((f) => ({
      ...f,
      package_id: pid,
      title: f.title || (pkg ? pkg.name.toUpperCase() : ""),
      subtitle: f.subtitle || (pkg ? pkg.description : ""),
      image_url: f.image_url || (pkg ? pkg.image_url : ""),
    }));
  };

  const save = async () => {
    if (!form.title) return toast.error("Title is required");
    const payload = { ...form, display_order: Number(form.display_order) };
    try {
      if (editing) await api.put(`/admin/combo-banners/${editing.id}`, payload);
      else await api.post("/admin/combo-banners", payload);
      toast.success("Banner saved"); setOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const toggleActive = async (b) => {
    await api.put(`/admin/combo-banners/${b.id}`, { ...b, package: undefined });
  };
  const setActive = async (b, val) => {
    await api.put(`/admin/combo-banners/${b.id}`, { ...b, is_active: val, package: undefined });
    toast.success(val ? "Banner activated" : "Banner deactivated"); load();
  };
  const del = async (id) => { await api.delete(`/admin/combo-banners/${id}`); toast.success("Deleted"); load(); };
  const toggleLoc = (id) => setForm((f) => ({ ...f, location_ids: f.location_ids.includes(id) ? f.location_ids.filter((x) => x !== id) : [...f.location_ids, id] }));

  const activeCount = banners.filter((b) => b.is_active).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monthly Combo Banners</h1>
          <p className="text-sm text-slate-500">{activeCount} active · customers see up to 5 per location</p>
        </div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={openNew} data-testid="add-banner-btn"><Plus className="mr-1 h-4 w-4" />Add Banner</Button>
      </div>

      {activeCount > 5 && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">You have more than 5 active banners; only the first 5 (by display order) show to customers.</p>
      )}

      <div className="mt-6 space-y-3">
        {banners.map((b) => (
          <div key={b.id} className="flex items-center gap-4 rounded-xl border bg-white p-3" data-testid={`banner-row-${b.id}`}>
            <div className="flex items-center gap-2 text-slate-400"><GripVertical className="h-4 w-4" /><span className="w-6 text-center text-sm">{b.display_order}</span></div>
            <img src={b.image_url || "https://via.placeholder.com/120x54?text=Banner"} alt="" className="h-14 w-28 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{b.title}</p>
              <p className="truncate text-xs text-slate-400">{b.subtitle}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {b.package && <Badge variant="outline">{b.package.name} · {inr(b.package.price)}</Badge>}
                {b.package?.savings > 0 && <Badge className="bg-saffron/15 text-saffron">Save {inr(b.package.savings)}</Badge>}
                <Badge variant="secondary">{(b.location_ids && b.location_ids.length) ? `${b.location_ids.length} location(s)` : "All locations"}</Badge>
              </div>
            </div>
            {b.is_active ? <Badge className="bg-forest-light text-forest">Active</Badge> : <Badge variant="secondary">Hidden</Badge>}
            <button onClick={() => setActive(b, !b.is_active)} data-testid={`toggle-banner-${b.id}`} title="Toggle active">
              {b.is_active ? <Eye className="h-4 w-4 text-slate-500 hover:text-forest" /> : <EyeOff className="h-4 w-4 text-slate-400" />}
            </button>
            <button onClick={() => openEdit(b)} data-testid={`edit-banner-${b.id}`}><Pencil className="h-4 w-4 text-slate-500 hover:text-forest" /></button>
            <button onClick={() => del(b.id)} data-testid={`delete-banner-${b.id}`}><Trash2 className="h-4 w-4 text-slate-500 hover:text-destructive" /></button>
          </div>
        ))}
        {banners.length === 0 && <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-400">No banners yet. Add 3–5 monthly combo banners to power the homepage carousel.</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="banner-dialog">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Combo Banner</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Linked Monthly Combo</Label>
              <select className="w-full rounded-md border p-2" data-testid="banner-package" value={form.package_id || ""} onChange={(e) => onSelectPackage(e.target.value)}>
                <option value="">— Select a combo —</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name} ({inr(p.price)})</option>)}
              </select>
            </div>
            <div><Label>Title</Label><Input data-testid="banner-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="MONTHLY FAMILY COMBO" /></div>
            <div><Label>Subtitle</Label><Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="Everything your family needs" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Promo text</Label><Input value={form.promo_text} onChange={(e) => setForm({ ...form, promo_text: e.target.value })} placeholder="Limited period offer" /></div>
              <div><Label>CTA text</Label><Input value={form.cta_text} onChange={(e) => setForm({ ...form, cta_text: e.target.value })} placeholder="View Combo" /></div>
            </div>
            <div>
              <div className="flex items-center justify-between"><Label>Banner image</Label><ImageUpload onUploaded={(url) => setForm((f) => ({ ...f, image_url: url }))} /></div>
              <Input className="mt-1" data-testid="banner-image" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="Upload or paste image URL" />
              {form.image_url && (
                <div className="relative mt-2 overflow-hidden rounded-lg" style={{ aspectRatio: "16 / 7" }}>
                  <img src={form.image_url} className="absolute inset-0 h-full w-full object-cover" alt="" />
                </div>
              )}
            </div>
            <div><Label>Display order</Label><Input type="number" data-testid="banner-order" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} /></div>
            <div>
              <Label>Visible in locations <span className="text-xs text-slate-400">(none selected = all locations)</span></Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {locations.map((l) => (
                  <button key={l.id} type="button" data-testid={`banner-loc-${l.id}`} onClick={() => toggleLoc(l.id)}
                    className={`rounded-full border px-3 py-1 text-xs ${form.location_ids.includes(l.id) ? "border-forest bg-forest text-white" : "border-slate-300"}`}>
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} data-testid="banner-active" />Active</label>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-banner-btn">Save banner</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
