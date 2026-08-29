import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const STATUS = [
  { v: "all", label: "All" },
  { v: "enabled", label: "Enabled" },
  { v: "disabled", label: "Disabled" },
  { v: "out", label: "Out of stock" },
  { v: "low", label: "Low stock" },
  { v: "expiring30", label: "Expiring ≤30d" },
  { v: "expiring7", label: "Expiring ≤7d" },
  { v: "expired", label: "Expired" },
];
const SORTS = [
  { v: "name", label: "Product name" },
  { v: "expiry", label: "Nearest expiry" },
  { v: "low", label: "Lowest stock" },
  { v: "out", label: "Out of stock first" },
];
const EXP = {
  expired: { label: "⚫ Expired", cls: "bg-slate-800 text-white" },
  very_soon: { label: "🔴 Expiring very soon", cls: "bg-red-100 text-red-700" },
  soon: { label: "🟡 Expiring soon", cls: "bg-amber-100 text-amber-700" },
  normal: { label: "🟢 Normal", cls: "bg-forest-light text-forest" },
  none: { label: "— No expiry", cls: "bg-slate-100 text-slate-500" },
};

const daysText = (e) => {
  if (!e || e.status === "none" || e.days == null) return "No expiry set";
  if (e.days < 0) return "Expired";
  if (e.days === 0) return "Expires today";
  return `Expires in ${e.days} day${e.days === 1 ? "" : "s"}`;
};

export default function AdminInventory() {
  const [pins, setPins] = useState([]);
  const [pincode, setPincode] = useState("");
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [edits, setEdits] = useState({});
  const [thEdits, setThEdits] = useState({});
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name");
  const [expanded, setExpanded] = useState({});
  const [bulkStock, setBulkStock] = useState("");
  const [copyTo, setCopyTo] = useState("");
  const [batchFor, setBatchFor] = useState(null);
  const [batchForm, setBatchForm] = useState({ batch_number: "", quantity: "", purchase_price: "", expiry_date: "" });

  useEffect(() => {
    api.get("/admin/pincodes").then(({ data }) => {
      const serv = data.filter((p) => p.is_serviceable);
      setPins(serv);
      setPincode(serv[0]?.pincode || "");
    });
  }, []);

  const load = (pc) => api.get(`/admin/inventory?pincode=${pc}`).then(({ data }) => { setItems(data); setEdits({}); setThEdits({}); });
  const loadSummary = (pc) => api.get(`/admin/inventory/expiry-summary?pincode=${pc}`).then(({ data }) => setSummary(data)).catch(() => {});
  useEffect(() => { if (pincode) { load(pincode); loadSummary(pincode); } }, [pincode]);

  const save = async (item) => {
    try {
      await api.put("/admin/inventory", {
        product_id: item.product_id, pincode,
        available_quantity: Number(edits[item.product_id] ?? item.available_quantity),
        low_stock_threshold: Number(thEdits[item.product_id] ?? item.low_stock_threshold),
        enabled: item.enabled,
      });
      toast.success("Updated"); load(pincode); loadSummary(pincode);
    } catch { toast.error("Error"); }
  };

  const toggleEnabled = async (item, enabled) => {
    try {
      await api.put("/admin/inventory", {
        product_id: item.product_id, pincode,
        available_quantity: item.available_quantity, low_stock_threshold: item.low_stock_threshold, enabled,
      });
      load(pincode); loadSummary(pincode);
    } catch { toast.error("Error"); }
  };

  const addBatch = async () => {
    if (!batchForm.batch_number.trim()) { toast.error("Batch number required"); return; }
    if (!(Number(batchForm.quantity) > 0)) { toast.error("Quantity must be > 0"); return; }
    try {
      await api.post("/admin/inventory/batch", {
        product_id: batchFor.product_id, pincode,
        batch_number: batchForm.batch_number.trim(), quantity: Number(batchForm.quantity),
        purchase_price: batchForm.purchase_price === "" ? null : Number(batchForm.purchase_price),
        expiry_date: batchForm.expiry_date || null,
      });
      toast.success("Batch added"); setBatchFor(null); setBatchForm({ batch_number: "", quantity: "", purchase_price: "", expiry_date: "" });
      load(pincode); loadSummary(pincode);
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const delBatch = async (item, b) => {
    try {
      await api.delete(`/admin/inventory/batch/${b.id}?product_id=${item.product_id}&pincode=${pincode}`);
      toast.success("Batch removed"); load(pincode); loadSummary(pincode);
    } catch { toast.error("Error"); }
  };

  const enableAll = async (scope) => {
    const body = scope === "all" ? { all_serviceable: true, enabled: true } : { pincodes: [pincode], enabled: true };
    if (bulkStock !== "") body.set_stock = Number(bulkStock);
    try {
      const { data } = await api.post("/admin/inventory/enable-all", body);
      toast.success(`Enabled ${data.rows_affected} product rows`); load(pincode); loadSummary(pincode);
    } catch { toast.error("Error enabling products"); }
  };

  const copyInv = async () => {
    if (!copyTo) { toast.error("Select a target PIN"); return; }
    try {
      const { data } = await api.post("/admin/inventory/copy", { from_pincode: pincode, to_pincodes: [copyTo] });
      toast.success(`Copied ${data.copied} product rows to ${copyTo}`);
    } catch { toast.error("Copy failed"); }
  };

  const filtered = items.filter((it) => {
    const text = `${it.product_name} ${it.sku} ${(it.batches || []).map((b) => b.batch_number).join(" ")}`.toLowerCase();
    if (q && !text.includes(q.toLowerCase())) return false;
    if (status === "enabled" && !it.enabled) return false;
    if (status === "disabled" && it.enabled) return false;
    if (status === "out" && !it.out_of_stock) return false;
    if (status === "low" && !it.low_stock) return false;
    if (status === "expiring30" && !["soon", "very_soon"].includes(it.expiry_status)) return false;
    if (status === "expiring7" && it.expiry_status !== "very_soon") return false;
    if (status === "expired" && it.expiry_status !== "expired") return false;
    return true;
  }).sort((a, b) => {
    if (sort === "expiry") return (a.nearest_expiry || "9999").localeCompare(b.nearest_expiry || "9999");
    if (sort === "low") return a.available_quantity - b.available_quantity;
    if (sort === "out") return (a.out_of_stock ? 0 : 1) - (b.out_of_stock ? 0 : 1);
    return a.product_name.localeCompare(b.product_name);
  });
  const currentPin = pins.find((p) => p.pincode === pincode);

  const cards = summary ? [
    { key: "all", label: "Total inventory", value: summary.total_inventory, cls: "text-slate-800" },
    { key: "low", label: "Low stock", value: summary.low_stock, cls: "text-amber-600" },
    { key: "out", label: "Out of stock", value: summary.out_of_stock, cls: "text-red-600" },
    { key: "expiring30", label: "Expiring ≤30d", value: summary.expiring_30, cls: "text-amber-600" },
    { key: "expiring7", label: "Expiring ≤7d", value: summary.expiring_7, cls: "text-red-600" },
    { key: "expired", label: "Expired", value: summary.expired, cls: "text-slate-800" },
  ] : [];

  return (
    <div data-testid="admin-inventory">
      <h1 className="text-2xl font-bold">PIN Code Inventory</h1>
      <p className="text-sm text-slate-500">Independent stock, batches & expiry per PIN code</p>

      {summary && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" data-testid="inventory-dashboard">
          {cards.map((c) => (
            <button key={c.key} onClick={() => setStatus(c.key)} data-testid={`summary-${c.key}`}
              className={`rounded-xl border bg-white p-3 text-left transition-colors hover:border-forest ${status === c.key ? "border-forest ring-1 ring-forest" : ""}`}>
              <p className={`text-2xl font-bold ${c.cls}`}>{c.value}</p>
              <p className="text-xs text-slate-400">{c.label}</p>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">PIN code</label>
          <Select value={pincode} onValueChange={setPincode}>
            <SelectTrigger className="w-48" data-testid="inventory-pincode-select"><SelectValue placeholder="Select PIN" /></SelectTrigger>
            <SelectContent>{pins.map((p) => <SelectItem key={p.pincode} value={p.pincode}>{p.pincode} · {p.area_name || p.location_name || ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Search (product / SKU / batch)</label>
          <Input className="w-56" placeholder="e.g. Basmati or BR24001" value={q} onChange={(e) => setQ(e.target.value)} data-testid="inventory-search" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40" data-testid="inventory-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Sort by</label>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-40" data-testid="inventory-sort"><SelectValue /></SelectTrigger>
            <SelectContent>{SORTS.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Bulk stock (optional)</label>
          <Input type="number" className="w-32" placeholder="e.g. 100" value={bulkStock} onChange={(e) => setBulkStock(e.target.value)} data-testid="inventory-bulk-stock" />
        </div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={() => enableAll("pin")} data-testid="enable-all-pin">Enable All (this PIN)</Button>
        <Button variant="outline" onClick={() => enableAll("all")} data-testid="enable-all-serviceable">Enable All (all PINs)</Button>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Copy this PIN → target</label>
          <div className="flex gap-2">
            <Select value={copyTo} onValueChange={setCopyTo}>
              <SelectTrigger className="w-36" data-testid="copy-target"><SelectValue placeholder="Target PIN" /></SelectTrigger>
              <SelectContent>{pins.filter((p) => p.pincode !== pincode).map((p) => <SelectItem key={p.pincode} value={p.pincode}>{p.pincode}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" onClick={copyInv} data-testid="copy-inventory-btn">Copy</Button>
          </div>
        </div>
      </div>

      {currentPin && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge className="bg-forest-light text-forest">Delivery: {currentPin.delivery_charge == null ? "Default" : `₹${currentPin.delivery_charge}`}</Badge>
          <Badge variant="secondary">{filtered.length} products</Badge>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr>
            <th className="px-4 py-2">Product</th><th className="px-4 py-2">Enabled</th>
            <th className="px-4 py-2">Available</th><th className="px-4 py-2">Low threshold</th>
            <th className="px-4 py-2">Batches</th><th className="px-4 py-2">Expiry status</th>
            <th className="px-4 py-2">Stock status</th><th className="px-4 py-2"></th>
          </tr></thead>
          <tbody>
            {filtered.map((it) => {
              const exp = { status: it.expiry_status, days: it.expiry_days };
              const isOpen = expanded[it.product_id];
              return (
                <Fragment key={it.product_id}>
                  <tr className="border-t" data-testid={`inventory-row-${it.product_id}`}>
                    <td className="px-4 py-2"><p className="font-medium">{it.product_name}</p><p className="text-xs text-slate-400">{it.sku} · {it.pack_size}</p></td>
                    <td className="px-4 py-2"><Switch checked={it.enabled} onCheckedChange={(v) => toggleEnabled(it, v)} data-testid={`enable-toggle-${it.product_id}`} /></td>
                    <td className="px-4 py-2"><Input type="number" className="h-8 w-24" value={edits[it.product_id] ?? it.available_quantity} disabled={(it.batch_count || 0) > 0} title={(it.batch_count || 0) > 0 ? "Managed by batches" : ""} onChange={(e) => setEdits({ ...edits, [it.product_id]: e.target.value })} data-testid={`stock-input-${it.product_id}`} /></td>
                    <td className="px-4 py-2"><Input type="number" className="h-8 w-20" value={thEdits[it.product_id] ?? it.low_stock_threshold} onChange={(e) => setThEdits({ ...thEdits, [it.product_id]: e.target.value })} data-testid={`threshold-input-${it.product_id}`} /></td>
                    <td className="px-4 py-2">
                      <button onClick={() => setExpanded({ ...expanded, [it.product_id]: !isOpen })} className="flex items-center gap-1 text-forest" data-testid={`toggle-batches-${it.product_id}`}>
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{it.batch_count || 0}
                      </button>
                    </td>
                    <td className="px-4 py-2"><Badge className={(EXP[it.expiry_status] || EXP.none).cls} data-testid={`expiry-status-${it.product_id}`}>{(EXP[it.expiry_status] || EXP.none).label}</Badge><p className="mt-0.5 text-xs text-slate-400">{daysText(exp)}</p></td>
                    <td className="px-4 py-2" data-testid={`stock-status-${it.product_id}`}>{!it.enabled ? <Badge variant="secondary">Disabled</Badge> : it.out_of_stock ? <Badge className="bg-slate-800 text-white">⚫ Out of Stock</Badge> : it.low_stock ? <Badge className="bg-red-100 text-red-700">🔴 Low Stock</Badge> : <Badge className="bg-forest-light text-forest">🟢 In Stock</Badge>}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <Button size="sm" className="h-8 bg-forest hover:bg-forest-dark" onClick={() => save(it)} data-testid={`save-stock-${it.product_id}`}>Save</Button>
                      <Button size="sm" variant="outline" className="ml-2 h-8" onClick={() => { setBatchFor(it); setBatchForm({ batch_number: "", quantity: "", purchase_price: "", expiry_date: "" }); }} data-testid={`add-batch-${it.product_id}`}><Plus className="mr-1 h-3 w-3" />Batch</Button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-t bg-slate-50/60" data-testid={`batches-panel-${it.product_id}`}>
                      <td colSpan="8" className="px-4 py-3">
                        {(it.batches || []).length === 0 ? (
                          <p className="text-xs text-slate-400">No batches. Legacy stock or use "+ Batch" to add one.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="text-slate-400"><tr><th className="py-1 text-left">Batch number</th><th className="py-1 text-left">Quantity</th><th className="py-1 text-left">Purchase ₹/unit</th><th className="py-1 text-left">Expiry date</th><th className="py-1 text-left">Status</th><th></th></tr></thead>
                            <tbody>
                              {it.batches.map((b) => (
                                <tr key={b.id} data-testid={`batch-${b.id}`}>
                                  <td className="py-1 font-mono">{b.batch_number}</td>
                                  <td className="py-1">{b.quantity}</td>
                                  <td className="py-1">{b.purchase_price != null ? `₹${b.purchase_price}` : "—"}</td>
                                  <td className="py-1">{b.expiry_date || "—"}</td>
                                  <td className="py-1"><span className="text-slate-500">{(EXP[b.expiry?.status] || EXP.none).label} · {daysText(b.expiry)}</span></td>
                                  <td className="py-1 text-right"><button onClick={() => delBatch(it, b)} data-testid={`del-batch-${b.id}`}><Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-600" /></button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan="8" className="px-4 py-6 text-center text-slate-400">No products match</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!batchFor} onOpenChange={(o) => !o && setBatchFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Batch{batchFor ? ` — ${batchFor.product_name}` : ""}</DialogTitle>
            <DialogDescription>Each batch keeps its own quantity and expiry date. Stock is added to this PIN.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Batch number</Label><Input value={batchForm.batch_number} onChange={(e) => setBatchForm({ ...batchForm, batch_number: e.target.value })} placeholder="e.g. BR24001" data-testid="batch-number-input" /></div>
            <div><Label>Quantity</Label><Input type="number" value={batchForm.quantity} onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })} placeholder="e.g. 50" data-testid="batch-quantity-input" /></div>
            <div><Label>Purchase price / unit (optional)</Label><Input type="number" value={batchForm.purchase_price} onChange={(e) => setBatchForm({ ...batchForm, purchase_price: e.target.value })} placeholder="e.g. 500" data-testid="batch-purchase-price-input" /></div>
            <div><Label>Expiry date</Label><Input type="date" value={batchForm.expiry_date} onChange={(e) => setBatchForm({ ...batchForm, expiry_date: e.target.value })} data-testid="batch-expiry-input" /></div>
          </div>
          <DialogFooter><Button className="bg-forest hover:bg-forest-dark" onClick={addBatch} data-testid="save-batch-btn">Add Batch</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
