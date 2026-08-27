import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/i18n";

/** Small caps mono label — plain text-xs for Sinhala (no letter-spacing / uppercase). */
export function captionClass(locale: Locale, className?: string): string {
  return cn(
    locale === "si" ? "text-xs" : "font-mono text-xs uppercase tracking-[0.15em]",
    className,
  );
}

/** Tighter-tracked caption variant (0.12em). */
export function captionClassTight(locale: Locale, className?: string): string {
  return cn(
    locale === "si" ? "text-xs" : "font-mono text-xs uppercase tracking-[0.12em]",
    className,
  );
}

/** Caption without fixed text-xs (e.g. inline nav labels). */
export function captionClassBare(locale: Locale, className?: string): string {
  return cn(
    locale === "si" ? "text-xs" : "font-mono uppercase tracking-[0.12em]",
    className,
  );
}

/** Mono metadata line (ID · timestamp) — tracking only, no uppercase. */
export function captionMetaClass(locale: Locale, className?: string): string {
  return cn(
    locale === "si" ? "text-xs" : "font-mono text-xs tracking-[0.12em]",
    className,
  );
}
