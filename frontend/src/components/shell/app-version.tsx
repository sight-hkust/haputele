"use client";

import { useHealth } from "@/lib/use-api";

// The backend /health endpoint is the single source of truth for the deployed
// version: CI bakes BUILD_VERSION/BUILD_COMMIT into the api image and the
// footer shows exactly what is running — no value frozen into the frontend
// bundle, and re-pinning images updates the display without a rebuild.
// While loading, or if the backend is unreachable, render nothing; the footer
// wrapper keeps the page layout stable.
export function AppVersion() {
  const { data } = useHealth();
  if (!data) return null;
  // Local builds default BUILD_COMMIT to "unknown" — the parenthetical
  // only makes sense for a real sha.
  const commit = data.commit === "unknown" ? null : data.commit.slice(0, 7);
  return (
    <span className="text-sm text-[var(--muted-foreground)]">
      {commit ? `Version ${data.version} (${commit})` : `Version ${data.version}`}
    </span>
  );
}
