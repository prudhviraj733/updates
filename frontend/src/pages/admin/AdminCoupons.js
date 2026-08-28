import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Layers, BarChart3 } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EMPTY = { code: "", coupon_type: "product", delivery_scope: "both", discount_type: "percentage", discount_value: 0, min_order_value: 0, max_discount: null, start_date: "", end_date: "", pin_codes: [], usage_limit: null, usage_limit_per_customer: null, is_active: true, location_ids: [], category_ids: [], category_id: null, first_order_only: false, visibility: "public" };
const BULK_EMPTY = { prefix: "SAVE", count: 10, coupon_type: "product", delivery_scope: "both", discount_type: "percentage", discount_value: 10, min_order_value: 0, max_discount: null, usage_limit: 1, usage_limit_per_customer: 1 };

export default function AdminCoupons() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const typeFilter = params.get("type");
  const scopeFilter = params.get("scope");
  const [coupons, setCoupons] = useState([]);
  const [categories, setCategories] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [range, setRange] = useState("30d");
  const [visFilter, setVisFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [usedFilter, setUsedFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [bulk, setBulk] = useState(BULK_EMPTY);

  const load = () => api.get("/admin/coupons").then(({ data }) => setCoupons(data));
  const loadAnalytics = (r = range) => api.get(`/admin/coupons/analytics?range=${r}`).then(({ data }) => setAnalytics(data)).catch(() => {});
  useEffect(() => { load(); api.get("/categories").then(({ data }) => setCategories(data)).catch(() => {}); }, []);
  useEffect(() => { loadAnalytics(range); }, [range]); // eslint-disable-line

  const catName = (id) => categories.find((c) => c.id === id)?.name;

  useEffect(() => {
    const action = params.get("action");
    if (action === "create") { setEditing(null); setForm({ ...EMPTY, coupon_type: typeFilter === "delivery" ? "delivery" : "product", delivery_scope: scopeFilter || "both" }); setOpen(true); }
    else if (action === "bulk") { setBulk({ ...BULK_EMPTY, coupon_type: typeFilter === "delivery" ? "delivery" : "product" }); setBulkOpen(true); }
  }, [params]); // eslint-disable-line

  const statMap = {};
  (analytics?.coupons || []).forEach((r) => { statMap[r.id] = r; });
  const visible = coupons.map((c) => ({ ...c, stats: statMap[c.id] })).filter((c) => {
    if (typeFilter && (c.coupon_type || "product") !== typeFilter) return false;
    if (scopeFilter && c.coupon_type === "delivery" && !["both", scopeFilter].includes(c.delivery_scope)) return false;
    if (visFilter !== "all" && (c.visibility || "public") !== visFilter) return false;
    if (catFilter !== "all" && c.category_id !== catFilter) return false;
    const st = c.stats || {};
    if (statusFilter === "active" && !c.is_active) return false;
    if (statusFilter === "inactive" && c.is_active) return false;
    if (statusFilter === "expired" && !st.expired) return false;
    if (usedFilter === "used" && !(st.redemptions > 0)) return false;
    if (usedFilter === "unused" && st.redemptions > 0) return false;
    return true;
  });

  const save = async () => {
    const payload = { ...form, discount_value: Number(form.discount_value), min_order_value: Number(form.min_order_value), max_discount: form.max_discount ? Number(form.max_discount) : null, usage_limit: form.usage_limit ? Number(form.usage_limit) : null, usage_limit_per_customer: form.usage_limit_per_customer ? Number(form.usage_limit_per_customer) : null, category_id: form.coupon_type === "product" ? (form.category_id || null) : null };
    try {
      if (editing) await api.put(`/admin/coupons/${editing.id}`, payload);
      else await api.post("/admin/coupons", payload);
      toast.success("Saved"); setOpen(false); load(); loadAnalytics();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };
  const generateBulk = async () => {
    try {
      const { data } = await api.post("/admin/coupons/bulk", { ...bulk, count: Number(bulk.count), discount_value: Number(bulk.discount_value), min_order_value: Number(bulk.min_order_value), max_discount: bulk.max_discount ? Number(bulk.max_discount) : null });
      toast.success(`Generated ${data.created} coupons`); setBulkOpen(false); load(); loadAnalytics();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };
  const del = async (id) => { await api.delete(`/admin/coupons/${id}`); load(); loadAnalytics(); };

  return (
    <div data-testid="admin-coupons">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Coupons &amp; Discounts</h1><p className="text-sm text-slate-500">{visible.length} coupons{typeFilter ? ` · ${typeFilter}${scopeFilter ? ` (${scopeFilter})` : ""}` : ""} · max 1 product + 1 delivery coupon per order</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setBulk(BULK_EMPTY); setBulkOpen(true); }} data-testid="bulk-coupon-btn"><Layers className="mr-1 h-4 w-4" />Bulk Generate</Button>
          <Button className="bg-forest hover:bg-forest-dark" onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }} data-testid="add-coupon-btn"><Plus className="mr-1 h-4 w-4" />Add Coupon</Button>
        </div>
      </div>

      {analytics && (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7" data-testid="coupon-dashboard">
          <Stat label="Active" value={analytics.totals.active_coupons} />
          <Stat label="Public" value={analytics.totals.public_coupons} />
          <Stat label="Private" value={analytics.totals.private_coupons} />
          <Stat label="Redemptions" value={analytics.totals.total_redemptions} />
          <Stat label="Discount given" value={inr(analytics.totals.total_discount)} />
          <Stat label="Revenue" value={inr(analytics.totals.total_revenue)} />
          <Stat label="Avg order" value={inr(analytics.totals.avg_order_value)} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="coupon-filters">
        <select className="rounded-md border p-2 text-sm" data-testid="range-filter" value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="month">This month</option><option value="all">All time</option>
        </select>
        <select className="rounded-md border p-2 text-sm" data-testid="visibility-filter" value={visFilter} onChange={(e) => setVisFilter(e.target.value)}>
          <option value="all">All visibility</option><option value="public">Public</option><option value="private">Private</option>
        </select>
        <select className="rounded-md border p-2 text-sm" data-testid="status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="expired">Expired</option>
        </select>
        <select className="rounded-md border p-2 text-sm" data-testid="used-filter" value={usedFilter} onChange={(e) => setUsedFilter(e.target.value)}>
          <option value="all">Used &amp; unused</option><option value="used">Used</option><option value="unused">Unused</option>
        </select>
        <select className="rounded-md border p-2 text-sm" data-testid="category-filter" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((c) => (
          <div key={c.id} className="rounded-xl border bg-white p-5" data-testid={`coupon-card-${c.id}`}>
            <div className="flex items-center justify-between">
              <p className="font-mono text-lg font-bold text-forest">{c.code}</p>
              <div className="flex gap-2">
                <button onClick={() => { setEditing(c); setForm({ ...EMPTY, ...c }); setOpen(true); }} data-testid={`edit-coupon-${c.id}`}><Pencil className="h-4 w-4 text-slate-500 hover:text-forest" /></button>
                <button onClick={() => del(c.id)} data-testid={`delete-coupon-${c.id}`}><Trash2 className="h-4 w-4 text-slate-500 hover:text-destructive" /></button>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Badge className={c.coupon_type === "delivery" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}>{c.coupon_type === "delivery" ? `Delivery · ${c.delivery_scope}` : "Product/Order"}</Badge>
              <Badge className={(c.visibility || "public") === "private" ? "bg-slate-200 text-slate-700" : "bg-green-100 text-green-700"} data-testid={`coupon-visibility-${c.id}`}>{(c.visibility || "public") === "private" ? "Private" : "Public"}</Badge>
              {c.category_id && <Badge className="bg-amber-100 text-amber-700" data-testid={`coupon-cat-badge-${c.id}`}>{catName(c.category_id) || "Category"} only</Badge>}
              {c.first_order_only && <Badge className="bg-orange-100 text-orange-700" data-testid={`coupon-firstorder-badge-${c.id}`}>First order</Badge>}
            </div>
            <p className="mt-2 text-sm">{c.discount_type === "percentage" ? `${c.discount_value}% off` : `${inr(c.discount_value)} off`}{c.max_discount ? ` (max ${inr(c.max_discount)})` : ""}</p>
            <p className="text-xs text-slate-400">Min order {inr(c.min_order_value)}</p>
            {(c.usage_limit || c.usage_limit_per_customer) && <p className="text-xs text-slate-400" data-testid={`coupon-limits-${c.id}`}>Limit {c.usage_limit ? `${c.usage_limit} total` : "∞"}{c.usage_limit_per_customer ? ` · ${c.usage_limit_per_customer}/customer` : ""}</p>}
            <div className="mt-2 flex items-center gap-2">
              {c.is_active ? <Badge className="bg-forest-light text-forest">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
              {c.stats?.expired && <Badge className="bg-red-100 text-red-700">Expired</Badge>}
            </div>
            {c.stats && (
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2 text-center text-xs" data-testid={`coupon-stats-${c.id}`}>
                <div><p className="font-bold text-slate-700">{c.stats.redemptions}</p><p className="text-slate-400">Used</p></div>
                <div><p className="font-bold text-slate-700">{inr(c.stats.revenue)}</p><p className="text-slate-400">Revenue</p></div>
                <div><p className="font-bold text-slate-700">{inr(c.stats.discount)}</p><p className="text-slate-400">Discount</p></div>
              </div>
            )}
            <Button variant="outline" size="sm" className="mt-3 w-full" data-testid={`coupon-stats-btn-${c.id}`} onClick={() => navigate(`/admin/coupons/${c.id}/stats`)}><BarChart3 className="mr-1 h-4 w-4" />View analytics</Button>
          </div>
        ))}
      </div>

      {visible.length === 0 && <div className="mt-10 text-center text-slate-400" data-testid="coupons-empty">No coupons match these filters.</div>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Coupon</DialogTitle><DialogDescription>Configure the discount, eligibility and visibility for this coupon.</DialogDescription></DialogHeader>
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
                    <SelectContent><SelectItem value="normal">Normal delivery</SelectItem><SelectItem value="express">30-Min only</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {form.coupon_type === "product" && (
              <div><Label>Eligible category (blank = whole cart)</Label>
                <Select value={form.category_id || "__all__"} onValueChange={(v) => setForm({ ...form, category_id: v === "__all__" ? null : v })}>
                  <SelectTrigger data-testid="coupon-category"><SelectValue placeholder="Whole cart" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Whole cart (all products)</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id} data-testid={`coupon-category-${c.id}`}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.category_id && <p className="mt-1 text-xs text-slate-500">Min spend &amp; discount apply only to <b>{catName(form.category_id)}</b> items.</p>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Discount type</Label><select className="w-full rounded-md border p-2" value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed</option></select></div>
              <div><Label>Value</Label><Input type="number" data-testid="coupon-value" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Min order value</Label><Input type="number" value={form.min_order_value} onChange={(e) => setForm({ ...form, min_order_value: e.target.value })} /></div>
              <div><Label>Max discount</Label><Input type="number" value={form.max_discount || ""} onChange={(e) => setForm({ ...form, max_discount: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valid from</Label><Input type="date" data-testid="coupon-start" value={(form.start_date || "").slice(0, 10)} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>Valid until</Label><Input type="date" data-testid="coupon-end" value={(form.end_date || "").slice(0, 10)} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>
            <div><Label>Target PIN codes (comma-separated, blank = all)</Label><Input data-testid="coupon-pins" value={(form.pin_codes || []).join(", ")} onChange={(e) => setForm({ ...form, pin_codes: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="e.g. 500034, 500081" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Total usage limit (blank = unlimited)</Label><Input type="number" data-testid="coupon-usage-limit" value={form.usage_limit ?? ""} onChange={(e) => setForm({ ...form, usage_limit: e.target.value === "" ? null : e.target.value })} /></div>
              <div><Label>Per-customer limit (blank = unlimited)</Label><Input type="number" data-testid="coupon-usage-limit-pc" value={form.usage_limit_per_customer ?? ""} onChange={(e) => setForm({ ...form, usage_limit_per_customer: e.target.value === "" ? null : e.target.value })} /></div>
            </div>
            <div><Label>Visibility</Label>
              <Select value={form.visibility || "public"} onValueChange={(v) => setForm({ ...form, visibility: v })}>
                <SelectTrigger data-testid="coupon-visibility"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public — shown in Available Coupons to eligible customers</SelectItem>
                  <SelectItem value="private">Private — code only, hidden from the list</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-between rounded-lg border p-2.5 text-sm"><span>Customer eligibility: <b>{form.first_order_only ? "First order only" : "All eligible customers"}</b></span><Switch checked={form.first_order_only} onCheckedChange={(v) => setForm({ ...form, first_order_only: v })} data-testid="coupon-first-order" /></label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Active</label>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-coupon-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Bulk Generate Coupons</DialogTitle><DialogDescription>Generate multiple unique coupon codes sharing the same discount settings.</DialogDescription></DialogHeader>
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

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <p className="text-lg font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
