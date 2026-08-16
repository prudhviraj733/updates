import { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function AdminInventory() {
  const [locations, setLocations] = useState([]);
  const [locId, setLocId] = useState("");
  const [items, setItems] = useState([]);
  const [edits, setEdits] = useState({});

  useEffect(() => { api.get("/admin/locations").then(({ data }) => { setLocations(data); setLocId(data[0]?.id || ""); }); }, []);
  const load = (id) => api.get(`/admin/inventory?location_id=${id}`).then(({ data }) => setItems(data));
  useEffect(() => { if (locId) load(locId); }, [locId]);

  const save = async (item) => {
    const val = edits[item.product_id] ?? item.available_quantity;
    try {
      await api.put("/admin/inventory", { product_id: item.product_id, location_id: locId, available_quantity: Number(val), low_stock_threshold: item.low_stock_threshold });
      toast.success("Updated"); load(locId);
    } catch (e) { toast.error("Error"); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Inventory</h1>
      <p className="text-sm text-slate-500">Location-based stock management</p>
      <select className="mt-4 rounded-md border p-2 text-sm" value={locId} onChange={(e) => setLocId(e.target.value)} data-testid="inventory-location-select">
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>

      <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-2">Product</th><th className="px-4 py-2">Available</th><th className="px-4 py-2">Reserved</th><th className="px-4 py-2">Sold</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.product_id} className="border-t" data-testid={`inventory-row-${it.product_id}`}>
                <td className="px-4 py-2"><p className="font-medium">{it.product_name}</p><p className="text-xs text-slate-400">{it.sku} · {it.pack_size}</p></td>
                <td className="px-4 py-2"><Input type="number" className="h-8 w-24" defaultValue={it.available_quantity} onChange={(e) => setEdits({ ...edits, [it.product_id]: e.target.value })} data-testid={`stock-input-${it.product_id}`} /></td>
                <td className="px-4 py-2">{it.reserved_quantity}</td>
                <td className="px-4 py-2">{it.sold_quantity}</td>
                <td className="px-4 py-2">{it.out_of_stock ? <Badge variant="destructive">Out</Badge> : it.low_stock ? <Badge className="bg-amber-100 text-amber-700">Low</Badge> : <Badge className="bg-forest-light text-forest">OK</Badge>}</td>
                <td className="px-4 py-2"><Button size="sm" className="h-8 bg-forest hover:bg-forest-dark" onClick={() => save(it)} data-testid={`save-stock-${it.product_id}`}>Save</Button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="6" className="px-4 py-6 text-center text-slate-400">No inventory records</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
