import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { saveTokens, clearTokens, getAccessToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=loading, false=logged out, object=logged in
  const [booting, setBooting] = useState(true);

  const loadUser = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) { setUser(false); setBooting(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    await saveTokens(data.token, data.refresh_token);
    setUser(data);
    return data;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    await saveTokens(data.token, data.refresh_token);
    setUser(data);
    return data;
  };

  const logout = async () => {
    await clearTokens();
    setUser(false);
  };

  const refreshUser = useCallback(async () => {
    try { const { data } = await api.get("/auth/me"); setUser(data); } catch { /* noop */ }
  }, []);

  const updateProfile = async (payload) => {
    const { data } = await api.put("/auth/profile", payload);
    await refreshUser();
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, booting, login, register, logout, refreshUser, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
