import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Camera, X, RefreshCw, Wallet, CheckCircle2, AlertCircle } from "lucide-react";
import api, { inr, formatError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const IMG_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%23f0ece3'/%3E%3C/svg%3E";

export default function ReturnFlow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [existing, setExisting] = useState([]);
  const [step, setStep] = useState(0);

  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [type, setType] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/orders/${id}`).then(({ data }) => setOrder(data));
    api.get("/returns/reasons").then(({ data }) => setReasons(data));
    api.get(`/me/returns?order_id=${id}`).then(({ data }) => setExisting(data));
  }, [id]);

  if (!order) return <div className="mx-auto max-w-2xl px-4 py-8"><Skeleton className="h-96 rounded-2xl" /></div>;

  const activeStatuses = ["requested", "under_review", "refund_approved", "refund_processing",
    "replacement_approved", "replacement_scheduled", "replacement_out_for_delivery"];
  const lockedProductIds = new Set(existing.filter((r) => activeStatuses.includes(r.status)).map((r) => r.product_id));

  if (order.status !== "delivered") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/40" />
        <p className="mt-4 font-medium">Refund / Replacement is available only after delivery.</p>
        <Button className="mt-4 rounded-full bg-forest" onClick={() => navigate(`/orders/${id}`)} data-testid="back-to-order">Back to order</Button>
      </div>
    );
  }

  const selectedItem = order.items.find((i) => i.product_id === productId);
  const selectedReason = reasons.find((r) => r.id === reasonId);
  const isOther = selectedReason?.is_other;
  const photoRequired = selectedReason?.requires_photo !== false;

  const uploadPhotos = async (files) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const { data } = await api.post("/me/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        setPhotos((p) => [...p, data.url]);
      }
    } catch (e) { toast.error(formatError(e.response?.data?.detail)); }
    finally { setUploading(false); }
  };

  const canNext = () => {
    if (step === 0) return !!productId;
    if (step === 1) return !!type;
    if (step === 2) return !!reasonId && (!isOther || description.trim().length > 0);
    if (step === 3) return !photoRequired || photos.length > 0;
    return true;
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post("/me/returns", { order_id: id, product_id: productId, quantity: qty, type, reason_id: reasonId, description, photos });
      toast.success("Request sent to our team");
      navigate(`/orders/${id}`);
    } catch (e) { toast.error(formatError(e.response?.data?.detail)); }
    finally { setSubmitting(false); }
  };

  const steps = ["Item", "Type", "Reason", "Photos", "Review"];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6" data-testid="return-flow">
      <button onClick={() => navigate(`/orders/${id}`)} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-forest"><ArrowLeft className="h-4 w-4" />Back</button>
      <h1 className="font-heading text-2xl font-bold">Refund / Replace Item</h1>
      <p className="text-sm text-muted-foreground">Order {order.order_number}</p>

      {/* Stepper */}
      <div className="mt-5 flex items-center gap-2" data-testid="return-stepper">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${i <= step ? "bg-forest text-white" : "bg-slate-200 text-slate-500"}`}>{i + 1}</div>
            {i < steps.length - 1 && <div className={`h-0.5 flex-1 ${i < step ? "bg-forest" : "bg-slate-200"}`} />}
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-black/5 bg-white p-6">
        {/* Step 0 — choose item */}
        {step === 0 && (
          <div data-testid="step-item">
            <h2 className="font-heading text-lg font-bold">Which item has an issue?</h2>
            <p className="text-sm text-muted-foreground">Select the specific item — you don't need to return the whole order.</p>
            <RadioGroup value={productId} onValueChange={setProductId} className="mt-4 space-y-2">
              {order.items.map((it) => {
                const locked = lockedProductIds.has(it.product_id);
                return (
                  <label key={it.product_id} data-testid={`return-item-${it.product_id}`}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${locked ? "opacity-50" : "cursor-pointer hover:border-forest"} ${productId === it.product_id ? "border-forest bg-forest-light/40" : "border-black/10"}`}>
                    <RadioGroupItem value={it.product_id} disabled={locked} data-testid={`return-item-radio-${it.product_id}`} />
                    <img src={it.image || IMG_PLACEHOLDER} alt={it.name} className="h-12 w-12 rounded-lg bg-cream object-cover" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{it.name}</p>
                      <p className="text-xs text-muted-foreground">{it.pack_size} · Qty {it.quantity} · {inr(it.line_total)}</p>
                    </div>
                    {locked && <span className="text-xs font-medium text-amber-600">Request in progress</span>}
                  </label>
                );
              })}
            </RadioGroup>
            {selectedItem && selectedItem.quantity > 1 && (
              <div className="mt-4 flex items-center gap-3">
                <Label>Quantity affected</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8 w-8 rounded-full p-0" onClick={() => setQty((q) => Math.max(1, q - 1))} data-testid="qty-minus">-</Button>
                  <span className="w-8 text-center font-medium" data-testid="qty-value">{qty}</span>
                  <Button variant="outline" size="sm" className="h-8 w-8 rounded-full p-0" onClick={() => setQty((q) => Math.min(selectedItem.quantity, q + 1))} data-testid="qty-plus">+</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 1 — refund or replace */}
        {step === 1 && (
          <div data-testid="step-type">
            <h2 className="font-heading text-lg font-bold">What would you like?</h2>
            <RadioGroup value={type} onValueChange={setType} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className={`cursor-pointer rounded-xl border p-4 ${type === "replacement" ? "border-forest bg-forest-light/40" : "border-black/10"}`} data-testid="type-replacement">
                <div className="flex items-center gap-2"><RadioGroupItem value="replacement" /><RefreshCw className="h-4 w-4 text-forest" /><span className="font-medium">Replace Item</span></div>
                <p className="mt-1 pl-6 text-xs text-muted-foreground">Get a fresh replacement delivered.</p>
              </label>
              <label className={`cursor-pointer rounded-xl border p-4 ${type === "refund" ? "border-forest bg-forest-light/40" : "border-black/10"}`} data-testid="type-refund">
                <div className="flex items-center gap-2"><RadioGroupItem value="refund" /><Wallet className="h-4 w-4 text-forest" /><span className="font-medium">Request Refund</span></div>
                <p className="mt-1 pl-6 text-xs text-muted-foreground">Refunded to your wallet after review.</p>
              </label>
            </RadioGroup>
          </div>
        )}

        {/* Step 2 — reason */}
        {step === 2 && (
          <div data-testid="step-reason">
            <h2 className="font-heading text-lg font-bold">Select a reason</h2>
            <RadioGroup value={reasonId} onValueChange={(v) => { setReasonId(v); const r = reasons.find((x) => x.id === v); if (!r?.is_other) setDescription(""); }} className="mt-4 space-y-2">
              {reasons.map((r) => (
                <label key={r.id} data-testid={`reason-${r.id}`} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${reasonId === r.id ? "border-forest bg-forest-light/40" : "border-black/10"}`}>
                  <RadioGroupItem value={r.id} />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </RadioGroup>
            {isOther && (
              <div className="mt-4" data-testid="other-explanation">
                <Label>Please explain the issue<span className="text-destructive"> *</span></Label>
                <Textarea className="mt-1" data-testid="description-input" placeholder="Describe what went wrong…" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {/* Step 3 — photos */}
        {step === 3 && (
          <div data-testid="step-photos">
            <h2 className="font-heading text-lg font-bold">Upload photo evidence</h2>
            <p className="mt-1 flex items-center gap-1 text-sm font-medium text-amber-600" data-testid="photo-required-note"><AlertCircle className="h-4 w-4" />Photo evidence is required to process this request.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {photos.map((url, i) => (
                <div key={i} className="relative" data-testid={`photo-thumb-${i}`}>
                  <img src={url} alt="" className="h-24 w-24 rounded-xl object-cover" />
                  <button onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-red-500 text-white" data-testid={`photo-remove-${i}`}><X className="h-3 w-3" /></button>
                </div>
              ))}
              <label className="grid h-24 w-24 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-black/15 text-muted-foreground hover:border-forest" data-testid="photo-upload-btn">
                <div className="text-center"><Camera className="mx-auto h-5 w-5" /><span className="text-xs">{uploading ? "…" : "Add"}</span></div>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadPhotos(e.target.files)} data-testid="photo-file-input" />
              </label>
            </div>
          </div>
        )}

        {/* Step 4 — review */}
        {step === 4 && (
          <div data-testid="step-review">
            <h2 className="font-heading text-lg font-bold">Review your request</h2>
            <div className="mt-4 space-y-2 text-sm">
              <Row l="Item" v={`${selectedItem?.name} × ${qty}`} />
              <Row l="Request" v={type === "refund" ? "Refund" : "Replacement"} />
              <Row l="Reason" v={selectedReason?.label} />
              {description && <Row l="Details" v={description} />}
              {type === "refund" && <Row l="Estimated refund" v={inr((selectedItem?.unit_price || 0) * qty)} />}
              <div className="flex flex-wrap gap-2 pt-2">{photos.map((u, i) => <img key={i} src={u} alt="" className="h-16 w-16 rounded-lg object-cover" />)}</div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Our team will review your request and photos before approving.</p>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <Button variant="outline" className="rounded-full" disabled={step === 0} onClick={() => setStep((s) => s - 1)} data-testid="return-back-btn"><ArrowLeft className="mr-1 h-4 w-4" />Back</Button>
        {step < steps.length - 1 ? (
          <Button className="rounded-full bg-forest" disabled={!canNext()} onClick={() => setStep((s) => s + 1)} data-testid="return-next-btn">Next<ArrowRight className="ml-1 h-4 w-4" /></Button>
        ) : (
          <Button className="rounded-full bg-forest" disabled={submitting} onClick={submit} data-testid="return-submit-btn"><CheckCircle2 className="mr-1 h-4 w-4" />{submitting ? "Submitting…" : "Submit request"}</Button>
        )}
      </div>
    </div>
  );
}

const Row = ({ l, v }) => (
  <div className="flex justify-between gap-4"><span className="text-muted-foreground">{l}</span><span className="text-right font-medium">{v}</span></div>
);
