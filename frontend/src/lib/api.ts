// Thin fetch wrapper. Auth is cookie-based: the browser auto-attaches the
// HttpOnly session cookie via `credentials: "include"`, and we echo the
// readable `csrf_token` cookie back as `X-CSRF-Token` on unsafe verbs.
//
// Backend errors are uniform: { detail: { error: code, requestId?, ...extra } }.
// We surface that as ApiError so callers can switch on `.error`.

// When NEXT_PUBLIC_API_URL is unset/empty we use the relative "/api" prefix
// so requests hit the same origin that served the page; next.config rewrites
// "/api/*" to the api container. Setting an absolute URL overrides this for
// cross-origin setups (in which case the backend must list it in
// CORS_ALLOW_ORIGINS and cookies need a matching domain).
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "X-CSRF-Token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class ApiError extends Error {
  status: number;
  error: string;
  detail?: Record<string, unknown>;
  // Backend stamps every error response with a UUID (X-Request-ID header,
  // also splatted into the JSON body). Surface it on ApiError so a user can
  // quote it in a bug report and we can grep the server logs for that id.
  requestId?: string;

  constructor(
    status: number,
    error: string,
    detail?: Record<string, unknown>,
    requestId?: string,
  ) {
    super(error);
    this.status = status;
    this.error = error;
    this.detail = detail;
    this.requestId = requestId;
  }
}

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  // Set true to silence the auto-redirect on 401. Used by the auth
  // bootstrap (`/auth/me`) and explicit logout, where bouncing the page
  // would either loop or land the user back on /login twice.
  skipAuthRedirect?: boolean;
};

// Read a cookie by name from document.cookie. Returns null on the server
// (no `document`) or when the cookie is absent. We only ever read the
// non-HttpOnly `csrf_token` here; the session JWT is unreadable by JS.
export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers, skipAuthRedirect, ...rest } = options;
  const method = (rest.method ?? "GET").toUpperCase();

  const finalHeaders: Record<string, string> = {
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(headers as Record<string, string> | undefined),
  };

  // CSRF echo on unsafe verbs. No cookie → no header; the backend
  // responds with 401 (no session) or 403 (csrf_failed), and the caller
  // learns to log in.
  if (!SAFE_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE_NAME);
    if (csrf) finalHeaders[CSRF_HEADER_NAME] = csrf;
  }

  const init: RequestInit = {
    ...rest,
    method,
    credentials: "include",
    headers: finalHeaders,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  };

  const res = await fetch(`${API_URL}${path}`, init);

  // 401 outside of /auth/login → session is gone; bounce to /login so the
  // user can reauth. /auth/me and /auth/logout opt out via skipAuthRedirect
  // because they're already aware of the unauthenticated case.
  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    !skipAuthRedirect &&
    !path.startsWith("/auth/login")
  ) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
    return new Promise<T>(() => {}); // never resolves; navigation in flight
  }

  const contentType = res.headers.get("content-type") ?? "";

  // 409 setup_required → backend has never been initialized. Bounce to the
  // setup wizard. The check has to peek at the body since 409 is also used
  // for legitimate domain conflicts (doctor_slot_taken, invalid_state, etc.).
  // `skipAuthRedirect` opts out — used by the AuthProvider bootstrap so a
  // visit to /setup itself doesn't get bounced to /setup (reload loop).
  if (
    res.status === 409 &&
    typeof window !== "undefined" &&
    !skipAuthRedirect &&
    !path.startsWith("/setup/") &&
    contentType.includes("application/json")
  ) {
    const cloned = res.clone();
    try {
      const peek = (await cloned.json()) as { detail?: { error?: string } };
      if (peek?.detail?.error === "setup_required") {
        window.location.href = "/setup";
        return new Promise<T>(() => {});
      }
    } catch {
      /* fall through to normal error handling */
    }
  }

  if (!res.ok) {
    let detail: unknown = null;
    if (contentType.includes("application/json")) {
      try {
        detail = await res.json();
      } catch {
        /* ignore */
      }
    }
    const errBody = (detail as { detail?: unknown } | null)?.detail ?? detail;
    let code = "request_failed";
    let extra: Record<string, unknown> | undefined;
    let requestId = res.headers.get("X-Request-ID") ?? undefined;
    if (errBody && typeof errBody === "object" && "error" in errBody) {
      code = String((errBody as Record<string, unknown>).error);
      const { error: _omit, requestId: bodyRid, ...rest2 } = errBody as Record<string, unknown>;
      extra = rest2;
      // Prefer the header (set even when the body is absent/non-JSON), but
      // fall back to the body field for parity with non-XHR clients.
      if (!requestId && typeof bodyRid === "string") requestId = bodyRid;
    } else if (typeof errBody === "string") {
      code = errBody;
    }
    throw new ApiError(res.status, code, extra, requestId);
  }

  if (res.status === 204) return undefined as T;
  if (contentType.includes("application/pdf")) return (await res.blob()) as unknown as T;
  if (contentType.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}
