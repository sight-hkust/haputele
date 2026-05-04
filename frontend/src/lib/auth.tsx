"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { api } from "./api";

export type Role = "admin" | "doctor" | "healthworker" | "sys-admin";

// Session state held in React only. The JWT lives in an HttpOnly cookie
// the page's JS can't read; `expiresAt` is optional because /auth/me
// doesn't return it (only /auth/login does).
export type Session = {
  username: string;
  role: Role;
  expiresAt?: string; // ISO
};

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  login: (s: Session) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Rehydrate from the cookie on mount. /auth/me returns 200 when the
  // session cookie is still valid; the api() wrapper turns a 401 into a
  // /login redirect, but we don't want that bounce for the unauthenticated
  // case (login page, setup wizard) — so we swallow 401 silently here via
  // the `skipAuthRedirect` opt-out.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api<{ username: string; role: Role }>("/auth/me", {
          skipAuthRedirect: true,
        });
        if (!cancelled) setSession({ username: me.username, role: me.role });
      } catch {
        // Not signed in. Stay anonymous.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((s: Session) => {
    // Called by the login form after a 200 from /auth/login. The cookies
    // are already set by the browser; we just mirror the returned user
    // info into React state for the UI.
    setSession(s);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST", skipAuthRedirect: true });
    } catch {
      // Best-effort: if the backend rejects (e.g. session already
      // expired), the cookies may not be cleared — but the UI should
      // still drop the session.
    }
    setSession(null);
    router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ session, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export const ROLE_HOMES: Record<Role, string> = {
  admin: "/admin",
  doctor: "/doctor",
  healthworker: "/healthworker/appointments",
  "sys-admin": "/sysadmin",
};
