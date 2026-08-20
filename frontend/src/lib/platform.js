// Website vs Android-app detection. The Android WebView/TWA app should set
// localStorage.platform = "app" (or open with ?platform=app), or expose
// window.ReactNativeWebView / a "FreshlyApp" UA token. Everything else is web.

export function getVisitorId() {
  let id = localStorage.getItem("visitor_id");
  if (!id) {
    id = "v-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("visitor_id", id);
  }
  return id;
}

export function detectPlatform() {
  try {
    const q = new URL(window.location.href).searchParams.get("platform");
    if (q) localStorage.setItem("platform", q.toLowerCase());
  } catch (e) { /* noop */ }
  const stored = (localStorage.getItem("platform") || "").toLowerCase();
  if (stored === "app" || stored === "web") return stored;
  const ua = (navigator.userAgent || "").toLowerCase();
  if (window.ReactNativeWebView || /freshlyapp|median|; wv\)/.test(ua) ||
      (document.referrer || "").startsWith("android-app://")) {
    return "app";
  }
  return "web";
}
