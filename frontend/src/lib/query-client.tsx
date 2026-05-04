"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { ApiError } from "@/lib/api";

// Register ApiError as the default error type for queries + mutations so
// `error.error` (the backend's stable code) is statically typed everywhere.
declare module "@tanstack/react-query" {
  interface Register {
    defaultError: ApiError;
  }
}

// One client per browser tab. Defaults are tuned for an internal admin UI:
// - retry once on transient failures, never on 4xx (auth/state errors are
//   meaningful and shouldn't be papered over)
// - 30s stale time so the calendar/list views feel responsive without
//   hammering the API
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry(failureCount, error) {
              if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
              return failureCount < 1;
            },
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
