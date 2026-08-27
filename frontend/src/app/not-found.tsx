"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { BackLink } from "@/components/primitives/back-link";
import { ROLE_HOMES, useAuth } from "@/lib/auth";
import { captionClass } from "@/lib/caption-class";
import { useI18n } from "@/lib/i18n";

// Global not-found boundary for any unmatched URL. Next renders this for paths
// with no matching route (and for explicit notFound() calls) inside the root
// layout, so the auth context is available. Behaviour follows the app's rule
// that every /* path stays behind the wall:
//   - signed out → bounce to /login
//   - signed in  → show a real 404 with a way back to their dashboard
export default function NotFound() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const { locale, t } = useI18n();

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/login");
  }, [session, loading, router]);

  // While auth resolves, or while we're redirecting a signed-out visitor, show
  // the same minimal spinner the guards use rather than flashing the 404.
  if (loading || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className={captionClass(locale, "text-[var(--muted-foreground)]")}>
          {t("common.loading")}
        </span>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex flex-col gap-2">
        <span className={captionClass(locale, "text-[var(--muted-foreground)]")}>
          {t("common.error404")}
        </span>
        <h1 className="font-display text-4xl tracking-[-0.02em] sm:text-5xl">
          {t("common.pageNotFound")}
        </h1>
        <p className="max-w-md text-[var(--muted-foreground)]">{t("common.pageNotFoundBody")}</p>
      </div>
      <BackLink href={ROLE_HOMES[session.role]}>{t("common.backToDashboard")}</BackLink>
    </main>
  );
}
