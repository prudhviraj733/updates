import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminDelivery() {
  const [params] = useSearchParams();
  const section = params.get("section");
  const SECTION_TITLE = { charges: "Delivery Charges", slots: "Delivery Slots" };
  const [locations, setLocations] = useState([]);
  const [locId, setLocId] = useState("");
  const [settings, setSettings] = useState(null);
  const [slots, setSlots] = useState({ slots: [] });
  const [holidayStr, setHolidayStr] = useState("");

  useEffect(() => { api.get("/admin/locations").then(({ data }) => { setLocations(data); setLocId(data[0]?.id || ""); }); }, []);
  useEffect(() => {
    if (!locId) return;
    api.get(`/admin/delivery/settings?location_id=${locId}`).then(({ data }) => { setSettings(data); setHolidayStr((data.holidays || []).join(", ")); });
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    api.get(`/delivery/slots?location_id=${locId}&date=${today}`).then(({ data }) => setSlots(data));
  }, [locId]);

  const save = async () => {
    const payload = {
      operating_start: settings.operating_start, operating_end: settings.operating_end,
      slot_duration_minutes: Number(settings.slot_duration_minutes), prep_time_minutes: Number(settings.prep_time_minutes),
      max_orders_per_slot: Number(settings.max_orders_per_slot),
      holidays: holidayStr.split(",").map((s) => s.trim()).filter(Boolean),
    };
    try { await api.put(`/admin/delivery/settings?location_id=${locId}`, payload); toast.success("Saved"); }
    catch (e) { toast.error("Error"); }
  };

  if (!settings) return <p>Loading…</p>;
  const set = (k) => (e) => setSettings({ ...settings, [k]: e.target.value });

  return (
    <div>
      <h1 className="text-2xl font-bold">{section ? SECTION_TITLE[section] : "Delivery & Slots"}</h1>
      <p className="text-sm text-slate-500">Configure operating hours, slots, lead time and normal delivery charge per location. (Get in 30 Minutes is configured per PIN code.)</p>
      <select className="mt-4 rounded-md border p-2 text-sm" value={locId} onChange={(e) => setLocId(e.target.value)} data-testid="delivery-location-select">
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-6">
          <h2 className="font-semibold">Slot Configuration</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div><Label>Operating start</Label><Input type="time" value={settings.operating_start} onChange={set("operating_start")} data-testid="op-start" /></div>
            <div><Label>Operating end</Label><Input type="time" value={settings.operating_end} onChange={set("operating_end")} data-testid="op-end" /></div>
            <div><Label>Slot duration (min)</Label><Input type="number" value={settings.slot_duration_minutes} onChange={set("slot_duration_minutes")} data-testid="slot-duration" /></div>
            <div><Label>Prep / lead time (min)</Label><Input type="number" value={settings.prep_time_minutes} onChange={set("prep_time_minutes")} data-testid="prep-time" /></div>
            <div><Label>Max orders / slot</Label><Input type="number" value={settings.max_orders_per_slot} onChange={set("max_orders_per_slot")} data-testid="max-orders" /></div>
          </div>
          <div className="mt-4"><Label>Holidays (YYYY-MM-DD, comma separated)</Label><Input value={holidayStr} onChange={(e) => setHolidayStr(e.target.value)} /></div>

          <Button className="mt-5 bg-forest hover:bg-forest-dark" onClick={save} data-testid="save-delivery-btn">Save settings</Button>
        </div>

        <div className="rounded-xl border bg-white p-6">
          <h2 className="font-semibold">Today's Generated Slots</h2>
          <p className="text-xs text-slate-400">Preview based on current settings & time</p>
          <div className="mt-4 space-y-2">
            {slots.slots.map((s) => (
              <div key={s.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${s.available ? "border-forest/30 bg-forest-light/40" : "bg-slate-50 text-slate-400"}`}>
                <span>{s.label}</span>
                <span className="text-xs">{s.available ? "Available" : s.reason === "full" ? "Full" : "Past lead time"}</span>
              </div>
            ))}
            {slots.slots.length === 0 && <p className="text-sm text-slate-400">No slots for today.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
