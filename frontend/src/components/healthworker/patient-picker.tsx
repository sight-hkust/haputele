"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/primitives/input";
import { captionClass, captionClassTight } from "@/lib/caption-class";
import { useI18n } from "@/lib/i18n";
import { usePatientList } from "@/lib/use-api";
import type { Patient } from "@/types/api";
import { fullName } from "@/lib/format";

export function PatientPicker({
  picked,
  onPick,
  onClear,
}: {
  picked: Patient | null;
  onPick: (p: Patient) => void;
  onClear: () => void;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const list = usePatientList({ search: debounced });
  const results = list.data?.patients ?? [];

  if (picked) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3">
        <div className="text-sm">
          <span className={captionClass(locale, "text-[var(--muted-foreground)]")}>
            {t("forms.forPatient")}
          </span>
          <div className="mt-1 font-medium">
            {fullName(picked)}{" "}
            <span className="font-mono text-xs text-[var(--muted-foreground)]">· #{picked.id}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onClear();
            setQuery("");
            setOpen(false);
          }}
          className={captionClassTight(locale, "inline-flex items-center gap-1  text-[var(--muted-foreground)] underline-offset-4 transition-colors hover:text-rose-600 hover:underline")}
        >
          <X className="h-3 w-3" />
          {t("common.change")}
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          type="text"
          placeholder={t("forms.searchByNameOrNid")}
          className="pl-9"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
        />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
          {list.isLoading ? (
            <div className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
              {t("common.searching")}
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
              {debounced ? t("forms.noPatientsMatch") : t("forms.startTypingToSearch")}
            </div>
          ) : (
            <ul className="py-1">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onPick(p);
                      setQuery("");
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-[var(--muted)]/60"
                  >
                    <span className="font-medium">{fullName(p)}</span>
                    <span className="font-mono text-xs text-[var(--muted-foreground)]">
                      {p.nationalId ? `NID ${p.nationalId}` : `#${p.id}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
