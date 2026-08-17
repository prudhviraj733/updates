import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Send, BarChart3, Users } from "lucide-react";
import api, { inr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const EMPTY = {
  name: "", offer_type: "comeback", discount_type: "fixed", discount_value: 150, max_discount: null,
  min_order_value: 999, free_delivery: false, target_type: "all", segment: "", customer_ids: [],
  location_ids: [], conditions: {}, priority: 0, start_date: "", end_date: "",
  usage_limit_per_customer: 1, shareable: false, is_active: true,
};
const SEGMENTS = ["new", "active", "repeat", "high_value", "inactive", "at_risk", "monthly_combo", "dry_fruit", "frequent_grocery"];

export default function AdminCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [segCounts, setSegCounts] = useState({});
  const [locations, setLocations] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [analytics, setAnalytics] = useState(null);

  const load = () => api.get("/admin/campaigns").then(({ data }) => setCampaigns(data));
  useEffect(() => {
    load();
    api.get("/admin/segments").then(({ data }) => setSegCounts(data.counts || {}));
    api.get("/admin/locations").then(({ data }) => setLocations(data));
  }, []);

  const setCond = (k, v) => setForm((f) => ({ ...f, conditions: { ...f.conditions, [k]: v === "" ? undefined : Number(v) } }));

  const save = async () => {
    if (!form.name) return toast.error("Name required");
    const payload = {
      ...form, discount_value: Number(form.discount_value), min_order_value: Number(form.min_order_value),
      max_discount: form.max_discount ? Number(form.max_discount) : null, priority: Number(form.priority),
      usage_limit_per_customer: Number(form.usage_limit_per_customer),
      segment: form.target_type === "segment" ? form.segment : null,
      start_date: form.start_date || null, end_date: form.end_date || null,
    };
    try { await api.post("/admin/campaigns", payload); toast.success("Campaign created"); setOpen(false); setForm(EMPTY); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const issue = async (id) => {
    try { const { data } = await api.post(`/admin/campaigns/${id}/issue`); toast.success(`Issued ${data.issued} coupons to ${data.eligible} eligible customers`); }
    catch (e) { toast.error("Error issuing coupons"); }
  };
  const showAnalytics = async (c) => {
    const { data } = await api.get(`/admin/campaigns/${c.id}/analytics`);
    setAnalytics({ ...data, name: c.name });
  };
  const toggleLoc = (id) => setForm((f) => ({ ...f, location_ids: f.location_ids.includes(id) ? f.location_ids.filter((x) => x !== id) : [...f.location_ids, id] }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Personalized Offers</h1><p className="text-sm text-slate-500">Target segments & customers with tailored campaigns</p></div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={() => { setForm(EMPTY); setOpen(true); }} data-testid="add-campaign-btn"><Plus className="mr-1 h-4 w-4" />New Campaign</Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {SEGMENTS.map((s) => <Badge key={s} variant="secondary" className="gap-1"><Users className="h-3 w-3" />{s.replace(/_/g, " ")}: {segCounts[s] || 0}</Badge>)}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Campaign</th><th className="px-4 py-2">Offer</th><th className="px-4 py-2">Target</th><th className="px-4 py-2">Priority</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-t" data-testid={`campaign-row-${c.id}`}>
                <td className="px-4 py-2 font-medium">{c.name}</td>
                <td className="px-4 py-2">{c.free_delivery ? "Free delivery" : c.discount_type === "percentage" ? `${c.discount_value}%` : inr(c.discount_value)}{c.min_order_value ? ` · min ${inr(c.min_order_value)}` : ""}</td>
                <td className="px-4 py-2 capitalize">{c.target_type}{c.segment ? ` · ${c.segment}` : ""}</td>
                <td className="px-4 py-2">{c.priority}</td>
                <td className="px-4 py-2">{c.is_active ? <Badge className="bg-forest-light text-forest">Active</Badge> : <Badge variant="secondary">Off</Badge>}</td>
                <td className="px-4 py-2"><div className="flex gap-2">
                  <button onClick={() => issue(c.id)} data-testid={`issue-${c.id}`} title="Issue coupons"><Send className="h-4 w-4 text-slate-500 hover:text-forest" /></button>
                  <button onClick={() => showAnalytics(c)} data-testid={`analytics-${c.id}`} title="Analytics"><BarChart3 className="h-4 w-4 text-slate-500 hover:text-forest" /></button>
                </div></td>
              </tr>
            ))}
            {campaigns.length === 0 && <tr><td colSpan="6" className="px-4 py-6 text-center text-slate-400">No campaigns yet</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="campaign-dialog">
          <DialogHeader><DialogTitle>New Personalized Campaign</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name</Label><Input data-testid="campaign-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Comeback ₹150" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Offer type</Label><select className="w-full rounded-md border p-2" value={form.offer_type} onChange={(e) => setForm({ ...form, offer_type: e.target.value })}>{["comeback","first_order","repeat","vip","product","category","combo","percentage","fixed","free_delivery"].map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
              <div><Label>Discount type</Label><select className="w-full rounded-md border p-2" value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}><option value="fixed">Fixed ₹</option><option value="percentage">Percentage %</option></select></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Value</Label><Input type="number" data-testid="campaign-value" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} /></div>
              <div><Label>Max disc</Label><Input type="number" value={form.max_discount || ""} onChange={(e) => setForm({ ...form, max_discount: e.target.value })} /></div>
              <div><Label>Min order</Label><Input type="number" value={form.min_order_value} onChange={(e) => setForm({ ...form, min_order_value: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.free_delivery} onCheckedChange={(v) => setForm({ ...form, free_delivery: v })} />Include free delivery</label>
            <div><Label>Target type</Label><select className="w-full rounded-md border p-2" data-testid="campaign-target" value={form.target_type} onChange={(e) => setForm({ ...form, target_type: e.target.value })}><option value="all">All eligible customers</option><option value="segment">Customer segment</option></select></div>
            {form.target_type === "segment" && (
              <div><Label>Segment</Label><select className="w-full rounded-md border p-2" data-testid="campaign-segment" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}><option value="">Select</option>{SEGMENTS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")} ({segCounts[s] || 0})</option>)}</select></div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Not ordered ≥ days</Label><Input type="number" onChange={(e) => setCond("not_ordered_days", e.target.value)} /></div>
              <div><Label>Min spend ≥</Label><Input type="number" onChange={(e) => setCond("min_total_spend", e.target.value)} /></div>
              <div><Label>Min orders ≥</Label><Input type="number" onChange={(e) => setCond("min_orders", e.target.value)} /></div>
            </div>
            <div>
              <Label>Locations <span className="text-xs text-slate-400">(none = all)</span></Label>
              <div className="mt-1 flex flex-wrap gap-2">{locations.map((l) => <button key={l.id} type="button" onClick={() => toggleLoc(l.id)} className={`rounded-full border px-3 py-1 text-xs ${form.location_ids.includes(l.id) ? "border-forest bg-forest text-white" : "border-slate-300"}`}>{l.name}</button>)}</div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Priority</Label><Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></div>
              <div><Label>Start</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>End</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Usage limit / customer</Label><Input type="number" value={form.usage_limit_per_customer} onChange={(e) => setForm({ ...form, usage_limit_per_customer: e.target.value })} /></div>
              <label className="mt-6 flex items-center gap-2 text-sm"><Switch checked={form.shareable} onCheckedChange={(v) => setForm({ ...form, shareable: v })} />Shareable</label>
            </div>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-campaign-btn">Create campaign</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!analytics} onOpenChange={() => setAnalytics(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Analytics · {analytics?.name}</DialogTitle></DialogHeader>
          {analytics && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[["Eligible","customers_eligible"],["Coupons issued","coupons_issued"],["Coupons redeemed","coupons_redeemed"],["Orders","orders_generated"],["Revenue","revenue_generated"],["Discount given","total_discount_given"],["Avg order value","average_order_value"],["Conversion %","conversion_rate"],["Free delivery used","free_delivery_usage"]].map(([lbl,k]) => (
                <div key={k} className="rounded-lg border bg-slate-50 p-3"><p className="text-xs text-slate-500">{lbl}</p><p className="text-lg font-bold">{["revenue_generated","total_discount_given","average_order_value"].includes(k) ? inr(analytics[k]) : analytics[k]}</p></div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
