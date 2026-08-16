import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Same backend as web + admin. No separate database.
export const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "https://grocery-hub-1077.preview.emergentagent.com";

const api = axios.create({ baseURL: `${BACKEND_URL}/api` });

// Mobile uses Bearer token (backend get_current_user supports Authorization header fallback).
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function setToken(token) {
  if (token) await AsyncStorage.setItem("access_token", token);
  else await AsyncStorage.removeItem("access_token");
}

export const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

export default api;
