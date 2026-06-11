"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input, Label } from "@/components/primitives/input";
import { Select, Textarea } from "@/components/primitives/select";
import { explainError } from "@/lib/error-codes";
import { useUpdateSystemConfig } from "@/lib/use-api";
import type { SystemConfig } from "@/types/api";
import { Field, Hint, Section } from "./account-sections";

// Address lines stored as string[] but edited as a textarea (one line = one entry).
function addrToText(lines: string[] | null | undefined): string {
  return lines?.join("\n") ?? "";
}
function textToAddr(text: string): string[] | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : null;
}

// All IANA timezone names available in the browser, grouped by region prefix.
function useTimezoneOptions() {
  return useMemo(() => {
    const all: string[] = Intl.supportedValuesOf("timeZone");
    const groups: Record<string, string[]> = {};
    for (const tz of all) {
      const region = tz.includes("/") ? tz.split("/")[0] : "Other";
      (groups[region] ??= []).push(tz);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, []);
}

function TimezoneSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const groups = useTimezoneOptions();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— select timezone —</option>
      {groups.map(([region, zones]) => (
        <optgroup key={region} label={region}>
          {zones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function SystemConfigForm({ config }: { config: SystemConfig }) {
  const update = useUpdateSystemConfig();
  const [done, setDone] = useState(false);

  const [instituteName, setInstituteName] = useState(config.instituteName ?? "");
  const [addressText, setAddressText] = useState(addrToText(config.instituteAddressLines));
  const [phone, setPhone] = useState(config.instituteContactPhone ?? "");
  const [email, setEmail] = useState(config.instituteContactEmail ?? "");
  const [appTz, setAppTz] = useState(config.appTimezone ?? "");
  const [exportTz, setExportTz] = useState(config.exportTimezone ?? "");
  const [consentVersion, setConsentVersion] = useState(config.masterConsentVersion ?? "");

  const dirty =
    instituteName !== (config.instituteName ?? "") ||
    addressText !== addrToText(config.instituteAddressLines) ||
    phone !== (config.instituteContactPhone ?? "") ||
    email !== (config.instituteContactEmail ?? "") ||
    appTz !== (config.appTimezone ?? "") ||
    exportTz !== (config.exportTimezone ?? "") ||
    consentVersion !== (config.masterConsentVersion ?? "");

  function handleSave() {
    setDone(false);
    update.mutate(
      {
        instituteName: instituteName || null,
        instituteAddressLines: textToAddr(addressText),
        instituteContactPhone: phone || null,
        instituteContactEmail: email || null,
        appTimezone: appTz || null,
        exportTimezone: exportTz || null,
        masterConsentVersion: consentVersion || null,
      },
      { onSuccess: () => setDone(true) },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title="Institute identity">
        <Field label="Institute name">
          <Input
            value={instituteName}
            onChange={(e) => setInstituteName(e.target.value)}
            placeholder="e.g. Hapu Eye Clinic"
          />
        </Field>
        <Field label="Address lines">
          <Textarea
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
            rows={3}
            placeholder={"Line 1\nLine 2\nLine 3"}
          />
          <Hint>One line per address entry.</Hint>
        </Field>
        <Field label="Contact phone">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +94 11 234 5678"
          />
        </Field>
        <Field label="Contact email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. contact@clinic.lk"
          />
        </Field>
      </Section>

      <Section title="Defaults">
        <Field label="App timezone">
          <TimezoneSelect value={appTz} onChange={setAppTz} />
          <Hint>Used for scheduling and display.</Hint>
        </Field>
        <Field label="Export timezone">
          <TimezoneSelect value={exportTz} onChange={setExportTz} />
          <Hint>Used when exporting reports.</Hint>
        </Field>
        <Field label="Master consent version">
          <Input
            value={consentVersion}
            onChange={(e) => setConsentVersion(e.target.value)}
            placeholder="e.g. 1.0"
          />
          <Hint>Version token printed on consent forms.</Hint>
        </Field>
      </Section>

      {update.error ? <ErrorBanner>{explainError(update.error.error)}</ErrorBanner> : null}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={!dirty || update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
        {done && !dirty ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}
