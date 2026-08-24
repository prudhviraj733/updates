import axios from "axios";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

// SAME production backend as the web app + admin. No separate database/API.
// Override at build time with EXPO_PUBLIC_BACKEND_URL, else app.json extra.apiUrl.
export const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  "https://bestkart.in";

const ACCESS_KEY = "bk_access_token";
const REFRESH_KEY = "bk_refresh_token";

const api = axios.create({ baseURL: `${BACKEND_URL}/api`, timeout: 20000 });

export async function saveTokens(access, refresh) {
  if (access) await SecureStore.setItemAsync(ACCESS_KEY, access);
  if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}
export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}
export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

// Attach the Bearer token (backend get_current_user accepts Authorization header).
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(ACCESS_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, try a single refresh using the stored refresh token, then retry.
let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      try {
        if (!refreshing) {
          const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
          if (!refresh) throw new Error("no refresh token");
          refreshing = axios
            .post(`${BACKEND_URL}/api/auth/refresh`, { refresh_token: refresh })
            .finally(() => { refreshing = null; });
        }
        const { data } = await refreshing;
        if (data?.token) {
          await SecureStore.setItemAsync(ACCESS_KEY, data.token);
          original.headers.Authorization = `Bearer ${data.token}`;
          return api(original);
        }
      } catch (e) {
        await clearTokens();
      }
    }
    return Promise.reject(error);
  }
);

export const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

export function apiError(e, fallback = "Something went wrong") {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return d[0]?.msg || fallback;
  if (typeof d === "string") return d;
  if (e?.message === "Network Error") return "No internet connection. Please try again.";
  return fallback;
}

export default api;
