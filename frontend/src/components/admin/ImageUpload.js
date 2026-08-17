import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";

export function ImageUpload({ onUploaded, label = "Upload" }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);

  const handle = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onUploaded(data.url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handle} data-testid="image-file-input" />
      <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={busy} data-testid="upload-image-btn">
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}{label}
      </Button>
    </>
  );
}
