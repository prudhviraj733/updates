import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Wallet, Plus } from "lucide-react";
import api, { inr, formatError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const STATUS_LABELS = {
  requested: "Requested", under_review: "Under Review", rejected: "Rejected",
  refund_approved: "Refund Approved", refund_processing: "Refund Processing", refunded: "Refunded",
  replacement_approved: "Replacement Approved", replacement_scheduled: "Replacement Preparing",
  replacement_out_for_delivery: "Replacement Out for Delivery", replaced: "Replacement Delivered",
};
const STATUS_COLOR = (s) =>
  s === "rejected" ? "bg-red-100 text-red-700"
    : ["refunded", "replaced"].includes(s) ? "bg-forest-light text-forest"
      : ["requested", "under_review"].includes(s) ? "bg-amber-100 text-amber-700"
        : "bg-blue-100 text-blue-700";

const REFUND_STEPS = ["under_review", "refund_approved", "refund_processing", "refunded", "rejected"];
const REPLACE_STEPS = ["under_review", "replacement_approved", "replacement_scheduled", "replacement_out_for_delivery", "replaced", "rejected"];

export default function AdminReturns() {
  const [tab, setTab] = useState("requests");
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState(null);
  const [active, setActive] = useState(null);

  const load = () => {
    const q = filter === "all" ? "" : `?status=${filter}`;
    api.get(`/admin/returns${q}`).then(({ data }) => setRows(data)).catch(() => setRows([]));
  };
  useEffect(load, [filter]);

  return (
    <div data-testid="admin-returns">
      <h1 className="text-2xl font-bold">Refund &amp; Replacement Requests</h1>
      <p className="text-sm text-slate-500">Review customer requests, approve refunds/replacements & manage eligible reasons.</p>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList>
          <TabsTrigger value="requests" data-testid="tab-requests">Requests</TabsTrigger>
          <TabsTrigger value="reasons" data-testid="tab-reasons">Eligible Reasons</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          <div className="mb-3 flex gap-2">
            {["all", "active", "requested", "refunded", "replaced", "rejected"].map((f) => (
              <button key={f} onClick={() => setFilter(f)} data-testid={`filter-${f}`}
                className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? "bg-forest text-white" : "bg-white text-slate-600 border"}`}>
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr><th className="px-3 py-2">Request</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2">PIN</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Date</th></tr>
              </thead>
              <tbody>
                {rows === null && <tr><td colSpan="10" className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>}
                {rows?.map((r) => (
                  <tr key={r.id} onClick={() => setActive(r)} className="cursor-pointer border-t hover:bg-slate-50" data-testid={`return-row-${r.id}`}>
                    <td className="px-3 py-2 font-medium">{r.request_number}</td>
                    <td className="px-3 py-2">{r.order_number}</td>
                    <td className="px-3 py-2">{r.customer_name}</td>
                    <td className="px-3 py-2">{r.product_name}</td>
                    <td className="px-3 py-2">{r.quantity}</td>
                    <td className="px-3 py-2">{r.type === "refund" ? <span className="inline-flex items-center gap-1"><Wallet className="h-3 w-3" />Refund</span> : <span className="inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" />Replace</span>}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate">{r.reason_label}</td>
                    <td className="px-3 py-2">{r.pincode}</td>
                    <td className="px-3 py-2"><Badge className={STATUS_COLOR(r.status)}>{STATUS_LABELS[r.status]}</Badge></td>
                    <td className="px-3 py-2 text-xs text-slate-400">{(r.created_at || "").slice(0, 10)}</td>
                  </tr>
                ))}
                {rows?.length === 0 && <tr><td colSpan="10" className="px-3 py-6 text-center text-slate-400">No requests</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="reasons" className="mt-4"><ReasonsManager /></TabsContent>
      </Tabs>

      <RequestDialog request={active} onClose={() => setActive(null)} onUpdated={() => { load(); setActive(null); }} />
    </div>
  );
}

function RequestDialog({ request, onClose, onUpdated }) {
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [noteOnly, setNoteOnly] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (request) { setStatus(request.status); setNote(""); setNoteOnly(""); setRefundAmount(request.line_amount); }
  }, [request]);

  if (!request) return null;
  const steps = request.type === "refund" ? REFUND_STEPS : REPLACE_STEPS;

  const addNote = async () => {
    if (!noteOnly.trim()) return;
    try { await api.post(`/admin/returns/${request.id}/note`, { note: noteOnly }); toast.success("Note added"); setNoteOnly(""); onUpdated(); }
    catch (e) { toast.error(formatError(e.response?.data?.detail)); }
  };

  const apply = async (targetStatus) => {
    if (targetStatus === "refunded") {
      const amt = Number(refundAmount);
      if (!(amt > 0) || amt > request.line_amount) {
        toast.error(`Refund must be between ₹1 and ₹${request.line_amount}`);
        return;
      }
    }
    setBusy(true);
    try {
      const body = { status: targetStatus, note };
      if (targetStatus === "refunded") body.refund_amount = Number(refundAmount);
      await api.put(`/admin/returns/${request.id}/status`, body);
      toast.success(`Marked ${STATUS_LABELS[targetStatus]}`);
      onUpdated();
    } catch (e) { toast.error(formatError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="return-detail-dialog">
        <DialogHeader><DialogTitle>{request.request_number} · <Badge className={STATUS_COLOR(request.status)}>{STATUS_LABELS[request.status]}</Badge></DialogTitle></DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <p><span className="text-slate-500">Order:</span> {request.order_number} · {inr(request.order_value)}</p>
            <p><span className="text-slate-500">Customer:</span> {request.customer_name} · {request.customer_phone}</p>
            <p><span className="text-slate-500">Product:</span> {request.product_name} × {request.quantity}</p>
            <p><span className="text-slate-500">Type:</span> {request.type === "refund" ? "Refund" : "Replacement"}</p>
            <p><span className="text-slate-500">Reason:</span> {request.reason_label}</p>
            <p><span className="text-slate-500">PIN:</span> {request.pincode}</p>
            {request.description && <p className="rounded bg-slate-50 p-2"><span className="text-slate-500">Message:</span> {request.description}</p>}
            {request.refund && <p className="text-forest">Refunded {inr(request.refund.amount)} → {request.refund.method} (ref {request.refund.reference_id?.slice(0, 8)})</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Photo evidence</p>
            <div className="flex flex-wrap gap-2" data-testid="request-photos">
              {(request.photos || []).map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer" data-testid={`request-photo-${i}`}><img src={u} alt="" className="h-20 w-20 rounded-lg object-cover" /></a>
              ))}
              {(!request.photos || request.photos.length === 0) && <span className="text-xs text-slate-400">No photos</span>}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="mt-2 rounded-lg border p-3">
          <p className="mb-2 text-xs font-medium text-slate-500">Status timeline</p>
          <ol className="space-y-1 text-xs">
            {(request.status_history || []).map((h, i) => (
              <li key={i} className="flex justify-between"><span>{STATUS_LABELS[h.status] || h.status}</span><span className="text-slate-400">{new Date(h.at).toLocaleString()}</span></li>
            ))}
          </ol>
        </div>

        {!["rejected", "refunded", "replaced"].includes(request.status) && (
          <div className="mt-2 rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">Update request</p>
            {request.type === "refund" && (
              <div className="mb-2 flex items-center gap-2">
                <label className="text-xs text-slate-500">Refund amount ₹</label>
                <Input type="number" min={0} max={request.line_amount} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="h-8 w-28" data-testid="refund-amount-input" />
                <span className="text-xs text-slate-400">max ₹{request.line_amount}</span>
              </div>
            )}
            <Textarea placeholder="Internal note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="mb-3" data-testid="internal-note-input" />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-56" data-testid="status-select"><SelectValue /></SelectTrigger>
                <SelectContent>{steps.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
              <Button className="rounded-full bg-forest" disabled={busy || status === request.status} onClick={() => apply(status)} data-testid="apply-status-btn">Update status</Button>
              {request.type === "refund"
                ? <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => apply("refund_approved")} data-testid="approve-refund-btn">Approve Refund</Button>
                : <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => apply("replacement_approved")} data-testid="approve-replacement-btn">Approve Replacement</Button>}
              <Button variant="outline" className="rounded-full text-red-600" disabled={busy} onClick={() => apply("rejected")} data-testid="reject-btn">Reject</Button>
            </div>
          </div>
        )}
        {/* Internal notes (available even on terminal requests) */}
        <div className="mt-2 rounded-lg border p-3">
          <p className="mb-2 text-sm font-medium">Internal notes</p>
          {(request.admin_notes || []).length > 0 && (
            <ul className="mb-2 space-y-1 text-xs text-slate-600" data-testid="admin-notes-list">
              {request.admin_notes.map((n, i) => <li key={i}>• {n.note} <span className="text-slate-400">({(n.at || "").slice(0, 16).replace("T", " ")})</span></li>)}
            </ul>
          )}
          <div className="flex gap-2">
            <Input placeholder="Add internal note" value={noteOnly} onChange={(e) => setNoteOnly(e.target.value)} data-testid="note-only-input" />
            <Button variant="outline" className="rounded-full" onClick={addNote} data-testid="add-note-btn">Add note</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReasonsManager() {
  const [reasons, setReasons] = useState([]);
  const [newLabel, setNewLabel] = useState("");
  const load = () => api.get("/admin/return-reasons").then(({ data }) => setReasons(data));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newLabel.trim()) return;
    try { await api.post("/admin/return-reasons", { label: newLabel, is_active: true, requires_photo: true }); setNewLabel(""); load(); toast.success("Reason added"); }
    catch (e) { toast.error(formatError(e.response?.data?.detail)); }
  };
  const save = async (r, patch) => {
    try { await api.put(`/admin/return-reasons/${r.id}`, { label: patch.label ?? r.label, is_active: patch.is_active ?? r.is_active, requires_photo: patch.requires_photo ?? r.requires_photo }); load(); }
    catch (e) { toast.error(formatError(e.response?.data?.detail)); }
  };

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <Input placeholder="Add a business-fault reason…" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} data-testid="new-reason-input" />
        <Button className="rounded-full bg-forest" onClick={add} data-testid="add-reason-btn"><Plus className="mr-1 h-4 w-4" />Add</Button>
      </div>
      <div className="rounded-xl border bg-white">
        {reasons.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0" data-testid={`reason-row-${r.id}`}>
            <Input defaultValue={r.label} onBlur={(e) => e.target.value !== r.label && save(r, { label: e.target.value })} className="max-w-md" data-testid={`reason-label-${r.id}`} />
            <label className="ml-auto flex items-center gap-2 text-xs text-slate-500">Photo required
              <Switch checked={r.requires_photo} onCheckedChange={(v) => save(r, { requires_photo: v })} data-testid={`reason-photo-${r.id}`} />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-500">Active
              <Switch checked={r.is_active} onCheckedChange={(v) => save(r, { is_active: v })} data-testid={`reason-active-${r.id}`} />
            </label>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">Customers only see active reasons. Change-of-mind reasons must not be added here.</p>
    </div>
  );
}
