import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { login as apiLogin, me, refresh as apiRefresh, register as apiRegister } from "./api";
import type { Role, UserProfile } from "./types";

type AuthContextValue = {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    name: string;
    email: string;
    username: string;
    password: string;
    role: Role;
  }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ACCESS_KEY = "rehab_access_token";
const REFRESH_KEY = "rehab_refresh_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(ACCESS_KEY));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem(REFRESH_KEY));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const boot = async () => {
      try {
        if (!accessToken && refreshToken) {
          const next = await apiRefresh(refreshToken);
          setAccessToken(next.access_token);
          localStorage.setItem(ACCESS_KEY, next.access_token);
          localStorage.setItem(REFRESH_KEY, next.refresh_token);
          setRefreshToken(next.refresh_token);
        }

        const token = accessToken || localStorage.getItem(ACCESS_KEY);
        if (token) {
          const profile = await me(token);
          setUser(profile);
        }
      } catch {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
        setAccessToken(null);
        setRefreshToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    void boot();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      refreshToken,
      user,
      loading,
      login: async (email, password) => {
        const tokens = await apiLogin(email, password);
        localStorage.setItem(ACCESS_KEY, tokens.access_token);
        localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
        setAccessToken(tokens.access_token);
        setRefreshToken(tokens.refresh_token);
        const profile = await me(tokens.access_token);
        setUser(profile);
      },
      register: async (payload) => {
        const tokens = await apiRegister(payload);
        localStorage.setItem(ACCESS_KEY, tokens.access_token);
        localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
        setAccessToken(tokens.access_token);
        setRefreshToken(tokens.refresh_token);
        const profile = await me(tokens.access_token);
        setUser(profile);
      },
      logout: () => {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
        setAccessToken(null);
        setRefreshToken(null);
        setUser(null);
      },
    }),
    [accessToken, refreshToken, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
