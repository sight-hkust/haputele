"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();

  // Rehydrate from the cookie on mount. /auth/me returns 200 when the
  // session cookie is still valid; the api() wrapper turns a 401 into a
  // /login redirect, but we don't want that bounce for the unauthenticated
  // case (login page, setup wizard) — so we swallow 401 silently here via
  // the `skipAuthRedirect` opt-out.
  //
  // Pre-init shortcut: /auth/me is gated by SetupRequiredMiddleware and
  // 409s before any auth dep runs when system_config.initialized_at is
  // NULL. The 409 is harmless (we swallow it) but pollutes devtools and
  // adds a round-trip on every page load before first-run setup. So we
  // check /setup/status first — the only endpoint guaranteed reachable
  // in every state — and skip /auth/me when we already know there can't
  // be a session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api<{ initialized: boolean }>("/setup/status");
        if (cancelled) return;
        if (!status.initialized) {
          // No init means no accounts means no session. Stay anonymous.
          return;
        }
        const me = await api<{ username: string; role: Role }>("/auth/me", {
          skipAuthRedirect: true,
        });
        if (!cancelled) setSession({ username: me.username, role: me.role });
      } catch {
        // Network/status read failed, or /auth/me said we're not signed
        // in. Stay anonymous either way — page-level guards will redirect
        // to /login if they need a session.
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
    // Drop every cached query so the next user never sees the previous one's
    // data flash before their own request resolves. The cache is keyed by
    // endpoint, not by user, so a stale `/doctors/me` would otherwise paint
    // for a frame after a different person signs in.
    queryClient.clear();
    router.replace("/login");
  }, [router, queryClient]);

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

// First URL segment → role. The sys-admin role uses the "sysadmin" segment
// (no hyphen) because Next route folders can't contain hyphens. Single source
// of truth for the (app) layout guard and the login redirect.
export const SEGMENT_TO_ROLE: Record<string, Role> = {
  admin: "admin",
  doctor: "doctor",
  healthworker: "healthworker",
  sysadmin: "sys-admin",
};

// Does this path live in the given role's section? Every protected page lives
// under a role segment, so a path that doesn't match the user's role is one
// they don't belong on.
export function pathMatchesRole(pathname: string, role: Role): boolean {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment !== undefined && SEGMENT_TO_ROLE[segment] === role;
}

// Where to send a user after sign-in: honour an explicit `?next=` only when it
// belongs to their own role, otherwise fall back to their home. This stops a
// stale or cross-role `next` (e.g. a doctor's 401 left `?next=/doctor`, then a
// health worker signs in) from bouncing them through another role's page.
export function resolveLoginRedirect(nextParam: string | null, role: Role): string {
  return nextParam && pathMatchesRole(nextParam, role) ? nextParam : ROLE_HOMES[role];
}
