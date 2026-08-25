import {
  createClient,
  type ResolvedRequest,
  type ResponseType,
  type Transport,
} from "@/gen/.kubb/client";
import { API_URL, ApiError, readCookie } from "@/lib/api";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "X-CSRF-Token";
const SAFE_METHOD: Record<string, true> = { GET: true, HEAD: true, OPTIONS: true };

async function parseResponse(response: Response, responseType?: ResponseType): Promise<unknown> {
  if (response.status === 204 || response.status === 205 || !response.body) return undefined;
  if (responseType === "blob") return response.blob();
  if (responseType === "arraybuffer") return response.arrayBuffer();
  if (responseType === "stream") return response.body;
  if (responseType === "text" || responseType === "document") return response.text();

  const contentType = response.headers.get("content-type") ?? "";
  if (responseType === "json" || contentType.includes("application/json")) {
    const body = await response.text();
    return body ? JSON.parse(body) : undefined;
  }
  if (contentType.startsWith("image/")) return response.blob();

  const body = await response.text();
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

const transport: Transport = async (request: ResolvedRequest) => {
  const init: RequestInit = {
    ...request.options,
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: request.signal,
    credentials: request.credentials,
  };
  const nativeRequest = new Request(request.url, init);

  let response: Response;
  try {
    response = await fetch(nativeRequest);
  } catch {
    throw new ApiError(0, "network_error");
  }

  return {
    data: await parseResponse(response, request.responseType),
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    contentType: response.headers.get("content-type") ?? undefined,
    request: nativeRequest,
    response,
  };
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
