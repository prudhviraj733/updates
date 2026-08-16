import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
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
