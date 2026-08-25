"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { ApiError, api } from "./api";

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
  // True when the bootstrap itself failed (backend unreachable / erroring).
  // Distinct from "no session": a signed-in user on a flaky network must not
  // be bounced to /login as though their session had expired. Guards render
  // a retry screen instead; retryBootstrap re-runs the probe.
  bootstrapFailed: boolean;
  retryBootstrap: () => void;
  login: (s: Session) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapFailed, setBootstrapFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

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
  //
  // A 401/409 from /auth/me means "genuinely signed out / not set up" —
  // stay anonymous. Anything else (rejected fetch, 5xx) means the backend
  // state is *unknown*: flag bootstrapFailed so guards show a retry screen
  // instead of mistaking a valid session for a lapsed one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retryBootstrap trigger — bumping it re-probes without being read in the body.
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
      } catch (err) {
        // 401 = signed out; 409 setup_required = pre-init. Both are known
        // anonymous states. Everything else is "couldn't tell".
        const knownAnonymous =
          err instanceof ApiError && (err.status === 401 || err.status === 409);
        if (!cancelled && !knownAnonymous) setBootstrapFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

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
      // Best-effort: leave this document even if the session already expired
      // or the backend is unavailable. Auth bootstrap will recheck any cookie.
    }
    // Keep the React session intact until this document unloads. Clearing it
    // first lets the still-mounted protected layout turn the old pathname into
    // `/login?next=...`, causing the next same-role login to resume that route.
    // Replacing the document also discards every in-memory cached query.
    window.location.replace("/login");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        bootstrapFailed,
        retryBootstrap: () => {
          setBootstrapFailed(false);
          setLoading(true);
          setAttempt((n) => n + 1);
        },
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
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
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return false;
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
