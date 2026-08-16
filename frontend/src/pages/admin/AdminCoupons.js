import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const EMPTY = { code: "", discount_type: "percentage", discount_value: 0, min_order_value: 0, max_discount: null, is_active: true, location_ids: [], category_ids: [] };

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = () => api.get("/admin/coupons").then(({ data }) => setCoupons(data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const payload = { ...form, discount_value: Number(form.discount_value), min_order_value: Number(form.min_order_value), max_discount: form.max_discount ? Number(form.max_discount) : null };
    try {
      if (editing) await api.put(`/admin/coupons/${editing.id}`, payload);
      else await api.post("/admin/coupons", payload);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };
  const del = async (id) => { await api.delete(`/admin/coupons/${id}`); load(); };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Coupons & Offers</h1><p className="text-sm text-slate-500">{coupons.length} coupons</p></div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }} data-testid="add-coupon-btn"><Plus className="mr-1 h-4 w-4" />Add Coupon</Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {coupons.map((c) => (
          <div key={c.id} className="rounded-xl border bg-white p-5" data-testid={`coupon-card-${c.id}`}>
            <div className="flex items-center justify-between">
              <p className="font-mono text-lg font-bold text-forest">{c.code}</p>
              <div className="flex gap-2">
                <button onClick={() => { setEditing(c); setForm(c); setOpen(true); }}><Pencil className="h-4 w-4 text-slate-500 hover:text-forest" /></button>
                <button onClick={() => del(c.id)} data-testid={`delete-coupon-${c.id}`}><Trash2 className="h-4 w-4 text-slate-500 hover:text-destructive" /></button>
              </div>
            </div>
            <p className="mt-2 text-sm">{c.discount_type === "percentage" ? `${c.discount_value}% off` : `${inr(c.discount_value)} off`}{c.max_discount ? ` (max ${inr(c.max_discount)})` : ""}</p>
            <p className="text-xs text-slate-400">Min order {inr(c.min_order_value)}</p>
            {c.is_active ? <Badge className="mt-2 bg-forest-light text-forest">Active</Badge> : <Badge variant="secondary" className="mt-2">Inactive</Badge>}
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Coupon</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Code</Label><Input data-testid="coupon-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label><select className="w-full rounded-md border p-2" value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed</option></select></div>
              <div><Label>Value</Label><Input type="number" data-testid="coupon-value" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Min order value</Label><Input type="number" value={form.min_order_value} onChange={(e) => setForm({ ...form, min_order_value: e.target.value })} /></div>
              <div><Label>Max discount</Label><Input type="number" value={form.max_discount || ""} onChange={(e) => setForm({ ...form, max_discount: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Active</label>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-coupon-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
