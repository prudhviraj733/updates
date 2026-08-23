import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, Clock, Users, Image as ImageIcon, X, Loader2, Megaphone } from "lucide-react";
import api, { formatError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const TYPES = [
  { v: "announcement", l: "Announcement" },
  { v: "offer", l: "Offer" },
  { v: "general", l: "General" },
];

const STATUS_STYLE = {
  sent: "bg-green-100 text-green-700",
  scheduled: "bg-amber-100 text-amber-700",
  sending: "bg-blue-100 text-blue-700",
  cancelled: "bg-slate-200 text-slate-600",
  failed: "bg-red-100 text-red-700",
};

export default function AdminNotifications() {
  const [form, setForm] = useState({
    title: "", body: "", image: "", deep_link: "", type: "announcement",
    target_type: "all", segment: "", scheduled_at: "",
  });
  const [segments, setSegments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [custSearch, setCustSearch] = useState("");
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const loadAll = async () => {
    try {
      const [seg, hist] = await Promise.all([
        api.get("/admin/notifications/segments"),
        api.get("/admin/notifications"),
      ]);
      setSegments(seg.data || []);
      setHistory(hist.data || []);
    } catch (e) { toast.error(formatError(e.response?.data?.detail)); }
  };

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (form.target_type === "selected" && customers.length === 0) {
      api.get("/admin/customers").then(({ data }) => setCustomers(data || [])).catch(() => {});
    }
  }, [form.target_type, customers.length]);

  const uploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      set("image", data.url);
      toast.success("Image uploaded");
    } catch (e2) { toast.error(formatError(e2.response?.data?.detail)); }
    finally { setUploading(false); }
  };

  const recipientEstimate = () => {
    if (form.target_type === "all") return segments.find((s) => s.key === "all")?.count ?? "—";
    if (form.target_type === "segment") return segments.find((s) => s.key === form.segment)?.count ?? "—";
    return selectedIds.length;
  };

  const send = async () => {
    if (!form.title.trim() || !form.body.trim()) return toast.error("Title and message are required");
    if (form.target_type === "segment" && !form.segment) return toast.error("Choose a segment");
    if (form.target_type === "selected" && selectedIds.length === 0) return toast.error("Select at least one customer");
    setSending(true);
    try {
      const payload = {
        title: form.title, body: form.body, image: form.image || null,
        deep_link: form.deep_link || null, type: form.type,
        target_type: form.target_type,
        customer_ids: form.target_type === "selected" ? selectedIds : [],
        segment: form.target_type === "segment" ? form.segment : null,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      };
      const { data } = await api.post("/admin/notifications", payload);
      toast.success(data.status === "scheduled" ? "Notification scheduled" : "Notification sent");
      setForm({ title: "", body: "", image: "", deep_link: "", type: "announcement", target_type: "all", segment: "", scheduled_at: "" });
      setSelectedIds([]);
      loadAll();
    } catch (e) { toast.error(formatError(e.response?.data?.detail)); }
    finally { setSending(false); }
  };

  const cancel = async (id) => {
    try { await api.delete(`/admin/notifications/${id}`); toast.success("Cancelled"); loadAll(); }
    catch (e) { toast.error(formatError(e.response?.data?.detail)); }
  };

  const filteredCustomers = customers.filter((c) => {
    const q = custSearch.toLowerCase();
    return !q || (c.name || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) || (c.phone || "").includes(q);
  });

  return (
    <div className="space-y-6" data-testid="admin-notifications">
      <div>
        <h1 className="font-heading text-2xl font-extrabold text-slate-900">Notifications</h1>
        <p className="text-sm text-slate-500">Compose and send push + in-app notifications to your customers.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Compose */}
        <div className="space-y-4 rounded-2xl border bg-white p-5 lg:col-span-3" data-testid="notification-compose">
          <div>
            <Label>Title</Label>
            <Input data-testid="notif-title" value={form.title} maxLength={120}
              onChange={(e) => set("title", e.target.value)} placeholder="e.g. Weekend Fresh Deals are live!" />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea data-testid="notif-body" value={form.body} maxLength={1000} rows={3}
              onChange={(e) => set("body", e.target.value)} placeholder="Write your notification message…" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger data-testid="notif-type"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Deep link (optional)</Label>
              <Input data-testid="notif-deeplink" value={form.deep_link}
                onChange={(e) => set("deep_link", e.target.value)} placeholder="/offers, /product/{id}, /orders" />
            </div>
          </div>

          <div>
            <Label>Image (optional)</Label>
            <div className="flex items-center gap-3">
              <Input data-testid="notif-image" value={form.image} onChange={(e) => set("image", e.target.value)} placeholder="https://… or upload" />
              <label className="flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                <input type="file" accept="image/*" className="hidden" onChange={uploadImage} data-testid="notif-image-upload" />
                Upload
              </label>
            </div>
            {form.image && (
              <div className="mt-2 flex items-center gap-2">
                <img src={form.image} alt="preview" className="h-14 w-14 rounded-lg object-cover" />
                <button onClick={() => set("image", "")} className="text-xs text-red-500 hover:underline"><X className="h-3 w-3" /></button>
              </div>
            )}
          </div>

          {/* Targeting */}
          <div>
            <Label>Send to</Label>
            <div className="flex flex-wrap gap-2">
              {["all", "segment", "selected"].map((t) => (
                <button key={t} data-testid={`notif-target-${t}`}
                  onClick={() => set("target_type", t)}
                  className={`rounded-full border px-4 py-1.5 text-sm capitalize transition-colors ${form.target_type === t ? "border-forest bg-forest text-white" : "hover:border-forest/40"}`}>
                  {t === "all" ? "All customers" : t === "segment" ? "Segment" : "Selected customers"}
                </button>
              ))}
            </div>
          </div>

          {form.target_type === "segment" && (
            <div>
              <Label>Segment</Label>
              <Select value={form.segment} onValueChange={(v) => set("segment", v)}>
                <SelectTrigger data-testid="notif-segment"><SelectValue placeholder="Choose a segment" /></SelectTrigger>
                <SelectContent>
                  {segments.filter((s) => s.key !== "all").map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label} ({s.count})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.target_type === "selected" && (
            <div>
              <Label>Pick customers ({selectedIds.length} selected)</Label>
              <Input value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Search name / email / phone" className="mb-2" data-testid="notif-customer-search" />
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-2">
                {filteredCustomers.slice(0, 100).map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted" data-testid={`notif-customer-${c.id}`}>
                    <input type="checkbox" checked={selectedIds.includes(c.id)}
                      onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id))} />
                    <span className="truncate">{c.name} · <span className="text-muted-foreground">{c.email || c.phone}</span></span>
                  </label>
                ))}
                {filteredCustomers.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No customers found</p>}
              </div>
            </div>
          )}

          <div>
            <Label>Schedule (optional — leave empty to send now)</Label>
            <Input type="datetime-local" data-testid="notif-schedule" value={form.scheduled_at}
              onChange={(e) => set("scheduled_at", e.target.value)} />
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <p className="flex items-center gap-1 text-sm text-slate-500"><Users className="h-4 w-4" /> ~{recipientEstimate()} recipients</p>
            <Button onClick={send} disabled={sending} className="rounded-full" data-testid="notif-send-btn">
              {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : form.scheduled_at ? <Clock className="mr-1 h-4 w-4" /> : <Send className="mr-1 h-4 w-4" />}
              {form.scheduled_at ? "Schedule" : "Send now"}
            </Button>
          </div>
        </div>

        {/* History */}
        <div className="rounded-2xl border bg-white p-5 lg:col-span-2" data-testid="notification-history">
          <h2 className="mb-3 font-heading font-bold text-slate-800">History</h2>
          {history.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Megaphone className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />No notifications sent yet
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((h) => (
                <div key={h.id} className="rounded-xl border p-3" data-testid={`notif-history-${h.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold text-slate-800">{h.title}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[h.status] || "bg-slate-100"}`}>{h.status}</span>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{h.body}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span><Users className="mr-0.5 inline h-3 w-3" />{h.recipient_count} recipients</span>
                    <span>{h.read_count || 0} read</span>
                    {h.push_success_count > 0 && <span>{h.push_success_count} pushed</span>}
                    <span>{h.status === "scheduled" ? `Scheduled: ${new Date(h.scheduled_at).toLocaleString("en-IN")}` : h.sent_at ? new Date(h.sent_at).toLocaleString("en-IN") : new Date(h.created_at).toLocaleString("en-IN")}</span>
                  </div>
                  {h.status === "scheduled" && (
                    <button onClick={() => cancel(h.id)} data-testid={`notif-cancel-${h.id}`} className="mt-2 text-xs font-medium text-red-500 hover:underline">Cancel</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
