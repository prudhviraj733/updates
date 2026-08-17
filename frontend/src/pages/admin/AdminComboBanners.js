import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, GripVertical, Eye, EyeOff, CalendarClock } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ImageUpload } from "@/components/admin/ImageUpload";

const EMPTY = {
  package_id: "", title: "", subtitle: "", promo_text: "", cta_text: "View Combo",
  image_url: "", display_order: 0, is_active: true, location_ids: [], start_date: "", end_date: "",
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function scheduleBadge(b) {
  const t = todayISO();
  if (b.start_date && b.start_date > t) return { label: `Scheduled · from ${b.start_date}`, cls: "bg-blue-100 text-blue-700" };
  if (b.end_date && b.end_date < t) return { label: `Expired · ${b.end_date}`, cls: "bg-red-100 text-red-700" };
  if (b.end_date) return { label: `Live · till ${b.end_date}`, cls: "bg-forest-light text-forest" };
  return null;
}

export default function AdminComboBanners() {
  const [banners, setBanners] = useState([]);
  const [packages, setPackages] = useState([]);
  const [locations, setLocations] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [dragIndex, setDragIndex] = useState(null);

  const load = () => api.get("/admin/combo-banners").then(({ data }) => setBanners(data));
  useEffect(() => {
    load();
    api.get("/admin/packages").then(({ data }) => setPackages(data));
    api.get("/admin/locations").then(({ data }) => setLocations(data));
  }, []);

  const openNew = () => { setEditing(null); setForm({ ...EMPTY, display_order: banners.length }); setOpen(true); };
  const openEdit = (b) => { setEditing(b); setForm({ ...EMPTY, ...b, start_date: b.start_date || "", end_date: b.end_date || "" }); setOpen(true); };

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
    if (form.start_date && form.end_date && form.end_date < form.start_date)
      return toast.error("End date must be after start date");
    const payload = {
      ...form, display_order: Number(form.display_order),
      start_date: form.start_date || null, end_date: form.end_date || null,
    };
    try {
      if (editing) await api.put(`/admin/combo-banners/${editing.id}`, payload);
      else await api.post("/admin/combo-banners", payload);
      toast.success("Banner saved"); setOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const setActive = async (b, val) => {
    const { package: _pkg, ...rest } = b;
    await api.put(`/admin/combo-banners/${b.id}`, { ...rest, is_active: val });
    toast.success(val ? "Banner activated" : "Banner deactivated"); load();
  };
  const del = async (id) => { await api.delete(`/admin/combo-banners/${id}`); toast.success("Deleted"); load(); };
  const toggleLoc = (id) => setForm((f) => ({ ...f, location_ids: f.location_ids.includes(id) ? f.location_ids.filter((x) => x !== id) : [...f.location_ids, id] }));

  const onDrop = async (i) => {
    if (dragIndex === null || dragIndex === i) { setDragIndex(null); return; }
    const arr = [...banners];
    const [moved] = arr.splice(dragIndex, 1);
    arr.splice(i, 0, moved);
    setBanners(arr);
    setDragIndex(null);
    try {
      await api.put("/admin/combo-banners/reorder", { ordered_ids: arr.map((b) => b.id) });
      toast.success("Order updated"); load();
    } catch { toast.error("Could not reorder"); load(); }
  };

  const activeCount = banners.filter((b) => b.is_active).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monthly Combo Banners</h1>
          <p className="text-sm text-slate-500">{activeCount} active · drag to reorder · customers see up to 5 per location</p>
        </div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={openNew} data-testid="add-banner-btn"><Plus className="mr-1 h-4 w-4" />Add Banner</Button>
      </div>

      {activeCount > 5 && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">You have more than 5 active banners; only the first 5 (by order) show to customers.</p>
      )}

      <div className="mt-6 space-y-3">
        {banners.map((b, i) => {
          const sched = scheduleBadge(b);
          return (
            <div
              key={b.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
              className={`flex items-center gap-4 rounded-xl border bg-white p-3 transition-shadow ${dragIndex === i ? "opacity-50" : ""}`}
              data-testid={`banner-row-${b.id}`}
            >
              <div className="flex cursor-grab items-center gap-2 text-slate-400 active:cursor-grabbing" data-testid={`drag-handle-${b.id}`}>
                <GripVertical className="h-4 w-4" /><span className="w-6 text-center text-sm">{i + 1}</span>
              </div>
              <img src={b.image_url || "https://via.placeholder.com/120x54?text=Banner"} alt="" className="h-14 w-28 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{b.title}</p>
                <p className="truncate text-xs text-slate-400">{b.subtitle}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {b.package && <Badge variant="outline">{b.package.name} · {inr(b.package.price)}</Badge>}
                  {b.package?.savings > 0 && <Badge className="bg-saffron/15 text-saffron">Save {inr(b.package.savings)}</Badge>}
                  <Badge variant="secondary">{(b.location_ids && b.location_ids.length) ? `${b.location_ids.length} location(s)` : "All locations"}</Badge>
                  {sched && <Badge className={`${sched.cls} gap-1`} data-testid={`schedule-${b.id}`}><CalendarClock className="h-3 w-3" />{sched.label}</Badge>}
                </div>
              </div>
              {b.is_active ? <Badge className="bg-forest-light text-forest">Active</Badge> : <Badge variant="secondary">Hidden</Badge>}
              <button onClick={() => setActive(b, !b.is_active)} data-testid={`toggle-banner-${b.id}`} title="Toggle active">
                {b.is_active ? <Eye className="h-4 w-4 text-slate-500 hover:text-forest" /> : <EyeOff className="h-4 w-4 text-slate-400" />}
              </button>
              <button onClick={() => openEdit(b)} data-testid={`edit-banner-${b.id}`}><Pencil className="h-4 w-4 text-slate-500 hover:text-forest" /></button>
              <button onClick={() => del(b.id)} data-testid={`delete-banner-${b.id}`}><Trash2 className="h-4 w-4 text-slate-500 hover:text-destructive" /></button>
            </div>
          );
        })}
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
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start date <span className="text-xs text-slate-400">(optional)</span></Label><Input type="date" data-testid="banner-start" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>End date <span className="text-xs text-slate-400">(optional)</span></Label><Input type="date" data-testid="banner-end" value={form.end_date || ""} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
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
