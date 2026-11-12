import { useCallback, useEffect, useState } from "react";
import AuthContext from "./authContext";
import api, { setAccessToken } from "../api/api";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = async (credentials) => {
    const { data } = await api.post("/auth/login", credentials);
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data;
  };

  const register = async (details) => {
    const { data } = await api.post("/auth/register", details);
    return data;
  };

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      try {
        const { data } = await api.post("/auth/refresh");

        if (active) {
          setAccessToken(data.accessToken);
          setUser(data.user);
        }
      } catch {
        setAccessToken(null);
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    const handleExpired = () => {
      setAccessToken(null);
      setUser(null);
    };

    window.addEventListener("auth:expired", handleExpired);
    restoreSession();

    return () => {
      active = false;
      window.removeEventListener("auth:expired", handleExpired);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
