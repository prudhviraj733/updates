import { createContext, useContext, useEffect, useState } from "react";
import api, { setToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    api.get("/auth/me").then(({ data }) => setUser(data)).catch(() => setUser(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    // Backend sets httpOnly cookie; for native we also accept a token if provided.
    if (data.token) await setToken(data.token);
    setUser(data);
    return data;
  };

  const logout = async () => {
    await setToken(null);
    setUser(false);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
