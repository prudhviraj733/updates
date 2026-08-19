import { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS = [
  { v: "all", label: "All" },
  { v: "enabled", label: "Enabled" },
  { v: "disabled", label: "Disabled" },
  { v: "out", label: "Out of stock" },
  { v: "low", label: "Low stock" },
];

export default function AdminInventory() {
  const [pins, setPins] = useState([]);
  const [pincode, setPincode] = useState("");
  const [items, setItems] = useState([]);
  const [edits, setEdits] = useState({});
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [bulkStock, setBulkStock] = useState("");

  useEffect(() => {
    api.get("/admin/pincodes").then(({ data }) => {
      const serv = data.filter((p) => p.is_serviceable);
      setPins(serv);
      setPincode(serv[0]?.pincode || "");
    });
  }, []);

  const load = (pc) => api.get(`/admin/inventory?pincode=${pc}`).then(({ data }) => { setItems(data); setEdits({}); });
  useEffect(() => { if (pincode) load(pincode); }, [pincode]);

  const save = async (item) => {
    const val = edits[item.product_id] ?? item.available_quantity;
    try {
      await api.put("/admin/inventory", {
        product_id: item.product_id, pincode,
        available_quantity: Number(val), low_stock_threshold: item.low_stock_threshold,
        enabled: item.enabled,
      });
      toast.success("Updated"); load(pincode);
    } catch (e) { toast.error("Error"); }
  };

  const toggleEnabled = async (item, enabled) => {
    try {
      await api.put("/admin/inventory", {
        product_id: item.product_id, pincode,
        available_quantity: item.available_quantity, low_stock_threshold: item.low_stock_threshold, enabled,
      });
      load(pincode);
    } catch { toast.error("Error"); }
  };

  const enableAll = async (scope) => {
    const body = scope === "all"
      ? { all_serviceable: true, enabled: true }
      : { pincodes: [pincode], enabled: true };
    if (bulkStock !== "") body.set_stock = Number(bulkStock);
    try {
      const { data } = await api.post("/admin/inventory/enable-all", body);
      toast.success(`Enabled ${data.rows_affected} product rows`);
      load(pincode);
    } catch { toast.error("Error enabling products"); }
  };

  const filtered = items.filter((it) => {
    if (q && !`${it.product_name} ${it.sku}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (status === "enabled" && !it.enabled) return false;
    if (status === "disabled" && it.enabled) return false;
    if (status === "out" && !it.out_of_stock) return false;
    if (status === "low" && !it.low_stock) return false;
    return true;
  });
  const currentPin = pins.find((p) => p.pincode === pincode);

  return (
    <div data-testid="admin-inventory">
      <h1 className="text-2xl font-bold">PIN Code Inventory</h1>
      <p className="text-sm text-slate-500">Independent stock & availability per PIN code</p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">PIN code</label>
          <Select value={pincode} onValueChange={setPincode}>
            <SelectTrigger className="w-48" data-testid="inventory-pincode-select"><SelectValue placeholder="Select PIN" /></SelectTrigger>
            <SelectContent>{pins.map((p) => <SelectItem key={p.pincode} value={p.pincode}>{p.pincode} · {p.area_name || p.location_name || ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-slate-500">Search</label>
          <Input className="w-56" placeholder="Product or SKU" value={q} onChange={(e) => setQ(e.target.value)} data-testid="inventory-search" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40" data-testid="inventory-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Bulk stock (optional)</label>
          <Input type="number" className="w-32" placeholder="e.g. 100" value={bulkStock} onChange={(e) => setBulkStock(e.target.value)} data-testid="inventory-bulk-stock" />
        </div>
        <Button className="bg-forest hover:bg-forest-dark" onClick={() => enableAll("pin")} data-testid="enable-all-pin">Enable All (this PIN)</Button>
        <Button variant="outline" onClick={() => enableAll("all")} data-testid="enable-all-serviceable">Enable All (all PINs)</Button>
      </div>

      {currentPin && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge className="bg-forest-light text-forest">Delivery: {currentPin.delivery_charge == null ? "Default" : `₹${currentPin.delivery_charge}`}</Badge>
          <Badge variant="secondary">{filtered.length} products</Badge>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Product</th><th className="px-4 py-2">Enabled</th><th className="px-4 py-2">Available</th><th className="px-4 py-2">Reserved</th><th className="px-4 py-2">Sold</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it.product_id} className="border-t" data-testid={`inventory-row-${it.product_id}`}>
                <td className="px-4 py-2"><p className="font-medium">{it.product_name}</p><p className="text-xs text-slate-400">{it.sku} · {it.pack_size}</p></td>
                <td className="px-4 py-2"><Switch checked={it.enabled} onCheckedChange={(v) => toggleEnabled(it, v)} data-testid={`enable-toggle-${it.product_id}`} /></td>
                <td className="px-4 py-2"><Input type="number" className="h-8 w-24" defaultValue={it.available_quantity} onChange={(e) => setEdits({ ...edits, [it.product_id]: e.target.value })} data-testid={`stock-input-${it.product_id}`} /></td>
                <td className="px-4 py-2">{it.reserved_quantity}</td>
                <td className="px-4 py-2">{it.sold_quantity}</td>
                <td className="px-4 py-2">{!it.enabled ? <Badge variant="secondary">Disabled</Badge> : it.out_of_stock ? <Badge variant="destructive">Out</Badge> : it.low_stock ? <Badge className="bg-amber-100 text-amber-700">Low</Badge> : <Badge className="bg-forest-light text-forest">OK</Badge>}</td>
                <td className="px-4 py-2"><Button size="sm" className="h-8 bg-forest hover:bg-forest-dark" onClick={() => save(it)} data-testid={`save-stock-${it.product_id}`}>Save</Button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan="7" className="px-4 py-6 text-center text-slate-400">No products match</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
