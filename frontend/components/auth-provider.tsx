"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokenStore } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { full_name: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      if (!tokenStore.get()) {
        if (active) setLoading(false);
        return;
      }
      try {
        const me = await api.auth.me();
        if (active) setUser(me);
      } catch {
        tokenStore.clear();
      } finally {
        if (active) setLoading(false);
      }
    }
    function unauthorized() {
      setUser(null);
      router.replace("/login");
    }
    window.addEventListener("pkonek:unauthorized", unauthorized);
    void restoreSession();
    return () => {
      active = false;
      window.removeEventListener("pkonek:unauthorized", unauthorized);
    };
  }, [router]);

  async function login(email: string, password: string) {
    const result = await api.auth.login({ email, password });
    tokenStore.set(result.access_token);
    setUser(result.user);
  }

  async function register(data: { full_name: string; email: string; password: string }) {
    const result = await api.auth.register(data);
    tokenStore.set(result.access_token);
    setUser(result.user);
  }

  function logout() {
    tokenStore.clear();
    setUser(null);
    router.push("/login");
  }

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
