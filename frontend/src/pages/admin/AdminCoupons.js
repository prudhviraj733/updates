import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Layers } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EMPTY = { code: "", coupon_type: "product", delivery_scope: "both", discount_type: "percentage", discount_value: 0, min_order_value: 0, max_discount: null, usage_limit: null, usage_limit_per_customer: null, is_active: true, location_ids: [], category_ids: [] };
const BULK_EMPTY = { prefix: "SAVE", count: 10, coupon_type: "product", delivery_scope: "both", discount_type: "percentage", discount_value: 10, min_order_value: 0, max_discount: null, usage_limit: 1, usage_limit_per_customer: 1 };

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [bulk, setBulk] = useState(BULK_EMPTY);

  const load = () => api.get("/admin/coupons").then(({ data }) => setCoupons(data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const payload = { ...form, discount_value: Number(form.discount_value), min_order_value: Number(form.min_order_value), max_discount: form.max_discount ? Number(form.max_discount) : null, usage_limit: form.usage_limit ? Number(form.usage_limit) : null, usage_limit_per_customer: form.usage_limit_per_customer ? Number(form.usage_limit_per_customer) : null };
    try {
      if (editing) await api.put(`/admin/coupons/${editing.id}`, payload);
      else await api.post("/admin/coupons", payload);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };
  const generateBulk = async () => {
    try {
      const { data } = await api.post("/admin/coupons/bulk", { ...bulk, count: Number(bulk.count), discount_value: Number(bulk.discount_value), min_order_value: Number(bulk.min_order_value), max_discount: bulk.max_discount ? Number(bulk.max_discount) : null });
      toast.success(`Generated ${data.created} coupons`); setBulkOpen(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };
  const del = async (id) => { await api.delete(`/admin/coupons/${id}`); load(); };

  return (
    <div data-testid="admin-coupons">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Coupons &amp; Discounts</h1><p className="text-sm text-slate-500">{coupons.length} coupons · max 1 product + 1 delivery coupon per order</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setBulk(BULK_EMPTY); setBulkOpen(true); }} data-testid="bulk-coupon-btn"><Layers className="mr-1 h-4 w-4" />Bulk Generate</Button>
          <Button className="bg-forest hover:bg-forest-dark" onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }} data-testid="add-coupon-btn"><Plus className="mr-1 h-4 w-4" />Add Coupon</Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {coupons.map((c) => (
          <div key={c.id} className="rounded-xl border bg-white p-5" data-testid={`coupon-card-${c.id}`}>
            <div className="flex items-center justify-between">
              <p className="font-mono text-lg font-bold text-forest">{c.code}</p>
              <div className="flex gap-2">
                <button onClick={() => { setEditing(c); setForm({ ...EMPTY, ...c }); setOpen(true); }}><Pencil className="h-4 w-4 text-slate-500 hover:text-forest" /></button>
                <button onClick={() => del(c.id)} data-testid={`delete-coupon-${c.id}`}><Trash2 className="h-4 w-4 text-slate-500 hover:text-destructive" /></button>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Badge className={c.coupon_type === "delivery" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}>{c.coupon_type === "delivery" ? `Delivery · ${c.delivery_scope}` : "Product/Order"}</Badge>
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
              <div><Label>Coupon type</Label>
                <Select value={form.coupon_type} onValueChange={(v) => setForm({ ...form, coupon_type: v })}>
                  <SelectTrigger data-testid="coupon-type"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="product">Product / Order</SelectItem><SelectItem value="delivery">Delivery</SelectItem></SelectContent>
                </Select>
              </div>
              {form.coupon_type === "delivery" && (
                <div><Label>Applies to</Label>
                  <Select value={form.delivery_scope} onValueChange={(v) => setForm({ ...form, delivery_scope: v })}>
                    <SelectTrigger data-testid="delivery-scope"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="normal">Normal delivery</SelectItem><SelectItem value="asap">ASAP only</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Discount type</Label><select className="w-full rounded-md border p-2" value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed</option></select></div>
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

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Bulk Generate Coupons</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Code prefix</Label><Input data-testid="bulk-prefix" value={bulk.prefix} onChange={(e) => setBulk({ ...bulk, prefix: e.target.value.toUpperCase() })} /></div>
              <div><Label>How many</Label><Input type="number" data-testid="bulk-count" value={bulk.count} onChange={(e) => setBulk({ ...bulk, count: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Coupon type</Label>
                <Select value={bulk.coupon_type} onValueChange={(v) => setBulk({ ...bulk, coupon_type: v })}>
                  <SelectTrigger data-testid="bulk-type"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="product">Product / Order</SelectItem><SelectItem value="delivery">Delivery</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Discount type</Label><select className="w-full rounded-md border p-2" value={bulk.discount_type} onChange={(e) => setBulk({ ...bulk, discount_type: e.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Value</Label><Input type="number" data-testid="bulk-value" value={bulk.discount_value} onChange={(e) => setBulk({ ...bulk, discount_value: e.target.value })} /></div>
              <div><Label>Min order</Label><Input type="number" value={bulk.min_order_value} onChange={(e) => setBulk({ ...bulk, min_order_value: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={generateBulk} data-testid="generate-bulk-btn">Generate</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
