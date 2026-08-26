"use client";

import { Globe } from "lucide-react";

import { useI18n, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/cn";

// Compact EN / සිං toggle for the topbar (and login). Brand name and person
// names stay English elsewhere; this only flips UI chrome language.
export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  const options: { id: Locale; label: string; aria: string }[] = [
    { id: "en", label: "EN", aria: t("language.switchToEnglish") },
    { id: "si", label: "සිං", aria: t("language.switchToSinhala") },
  ];

  return (
    <div
      role="group"
      aria-label={t("language.toggleLabel")}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] p-0.5 shadow-sm",
        className,
      )}
    >
      <Globe
        aria-hidden
        className="ml-2 h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]"
      />
      {options.map(({ id, label, aria }) => {
        const active = locale === id;
        return (
          <button
            key={id}
            type="button"
            aria-label={aria}
            aria-pressed={active}
            onClick={() => setLocale(id)}
            className={cn(
              "min-w-[3rem] rounded-full px-3 py-1.5 text-center font-mono text-xs font-medium uppercase tracking-[0.12em] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
              active
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:bg-[var(--card)]/60 hover:text-[var(--foreground)]",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
