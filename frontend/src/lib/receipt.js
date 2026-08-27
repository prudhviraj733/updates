import api from "./api";

// Fetch a receipt PDF (auth via api interceptors) and either download or open-to-print.
export async function getReceipt(url, filename, { print = false } = {}) {
  const { data } = await api.get(url, { responseType: "blob" });
  const blob = new Blob([data], { type: "application/pdf" });
  const objUrl = URL.createObjectURL(blob);
  if (print) {
    const w = window.open(objUrl, "_blank");
    if (w) {
      w.onload = () => { try { w.focus(); w.print(); } catch (e) { /* noop */ } };
    }
  } else {
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename || "receipt.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(objUrl), 15000);
}
