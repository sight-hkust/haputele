import {
  createClient,
  isResponseError,
  toRequestInit,
  type ResolvedRequest,
  type Transport,
} from "@/gen/.kubb/client";
import { API_URL, ApiError, readCookie } from "@/lib/api";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "X-CSRF-Token";
const SAFE_METHOD: Record<string, true> = { GET: true, HEAD: true, OPTIONS: true };

// The kubb core decodes response bodies itself once the transport hands back
// the raw `Response` — JSON, `image/*` as blobs, empty bodies as undefined,
// and a lenient text fallback. The custom parser this file carried under
// kubb 5 duplicated that work at the transport layer.
const transport: Transport = async (request: ResolvedRequest) => {
  const nativeRequest = new Request(request.url, toRequestInit(request));

  let response: Response;
  try {
    response = await fetch(nativeRequest);
  } catch {
    throw new ApiError(0, "network_error");
  }

  return { webResponse: response, request: nativeRequest, response };
};

export const generatedApiClient = createClient({
  baseURL: API_URL,
  credentials: "include",
  transport,
});

generatedApiClient.interceptors.request.use((request) => {
  if (SAFE_METHOD[request.method.toUpperCase()]) return request;
  const csrf = readCookie(CSRF_COOKIE_NAME);
  if (!csrf || request.headers[CSRF_HEADER_NAME]) return request;
  return {
    ...request,
    headers: { ...request.headers, [CSRF_HEADER_NAME]: csrf },
  };
});

generatedApiClient.interceptors.response.use(async (result) => {
  if (typeof window === "undefined") return result;

  const path = new URL(result.request.url).pathname;
  if (result.status === 401 && !path.endsWith("/auth/login")) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
    const { promise } = Promise.withResolvers<never>();
    return promise;
  }

  const detail = (result.data as { detail?: { error?: string } } | undefined)?.detail;
  if (result.status === 409 && detail?.error === "setup_required" && !path.includes("/setup/")) {
    window.location.href = "/setup";
    const { promise } = Promise.withResolvers<never>();
    return promise;
  }

  return result;
});

generatedApiClient.interceptors.error.use((responseError) => {
  // Non-HTTP failures (aborts, body-validation errors) carry no status
  // envelope to translate, so they pass through untouched.
  if (!isResponseError(responseError)) return responseError;

  const body = responseError.data as
    | { detail?: { error?: unknown; requestId?: unknown; [key: string]: unknown } }
    | undefined;
  const detail = body?.detail;
  const code = typeof detail?.error === "string" ? detail.error : "request_failed";
  const requestIdHeader = responseError.response.headers.get("X-Request-ID") ?? undefined;
  const requestId =
    requestIdHeader ?? (typeof detail?.requestId === "string" ? detail.requestId : undefined);
  const extra = detail ? { ...detail } : undefined;
  if (extra) {
    delete extra.error;
    delete extra.requestId;
  }
  throw new ApiError(responseError.status, code, extra, requestId);
});
