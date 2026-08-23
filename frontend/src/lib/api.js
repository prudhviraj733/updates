import axios from "axios";
import { detectPlatform, getVisitorId } from "@/lib/platform";

// Single-domain safe: if REACT_APP_BACKEND_URL is empty/unset, fall back to a
// same-origin relative "/api" (nginx proxies /api -> backend). Never bake
// the literal string "undefined".
const RAW_BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");
export const API = `${RAW_BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  try {
    config.headers["X-Client-Platform"] = detectPlatform();
    config.headers["X-Visitor-Id"] = getVisitorId();
  } catch (e) { /* noop */ }
  return config;
});

export function formatError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export function inr(v) {
  return `₹${Number(v || 0).toLocaleString("en-IN")}`;
}

export default api;
