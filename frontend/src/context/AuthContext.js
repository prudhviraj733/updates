import { createContext, useContext, useEffect, useState } from "react";
import api, { formatError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = not auth, object = auth

  const checkAuth = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setUser(data);
      return { ok: true, user: data };
    } catch (e) {
      return { ok: false, error: formatError(e.response?.data?.detail) || e.message };
    }
  };

  const register = async (payload) => {
    try {
      const { data } = await api.post("/auth/register", payload);
      setUser(data);
      return { ok: true, user: data };
    } catch (e) {
      return { ok: false, error: formatError(e.response?.data?.detail) || e.message };
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    setUser(false);
  };

  const updateProfile = async (payload) => {
    const { data } = await api.put("/auth/profile", payload);
    setUser(data);
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateProfile, refresh: checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
