"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { en, type Dictionary } from "@/lib/i18n/en";
import { si } from "@/lib/i18n/si";

export type Locale = "en" | "si";

const STORAGE_KEY = "haputele.locale";
const DICTS: Record<Locale, Dictionary> = { en, si };

// Module-level locale so non-React helpers (explainError) stay in sync with
// the provider without every call site needing a hook.
let activeLocale: Locale = "en";

export function getActiveLocale(): Locale {
  return activeLocale;
}

type NestedValue = string | { [key: string]: NestedValue };

function lookup(dict: Dictionary, key: string): string | undefined {
  const parts = key.split(".");
  let cur: NestedValue | undefined = dict as unknown as NestedValue;
  for (const part of parts) {
    if (cur == null || typeof cur === "string") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  );
}

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const fromLocale = lookup(DICTS[locale], key);
  const fromEn = locale === "en" ? fromLocale : lookup(DICTS.en, key);
  const raw = fromLocale ?? fromEn ?? key;
  return interpolate(raw, vars);
}

type I18nContextValue = {
  locale: Locale;
  /** False until the stored locale has been read — avoids remounting locale-sensitive widgets mid-hydration. */
  ready: boolean;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "si") return stored;
  } catch {
    // private mode / blocked storage — stay on default
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = readStoredLocale();
    activeLocale = initial;
    setLocaleState(initial);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    activeLocale = locale;
    document.documentElement.lang = locale === "si" ? "si" : "en";
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // ignore
    }
  }, [locale, ready]);

  const setLocale = useCallback((next: Locale) => {
    activeLocale = next;
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(() => ({ locale, ready, setLocale, t }), [locale, ready, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <LanguageProvider>");
  return ctx;
}
