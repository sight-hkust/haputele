"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Input } from "@/components/primitives/input";
import { Select, Textarea } from "@/components/primitives/select";
import { explainError } from "@/lib/error-codes";
import { useI18n } from "@/lib/i18n";
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
      if (!groups[region]) groups[region] = [];
      groups[region].push(tz);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, []);
}

function TimezoneSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const groups = useTimezoneOptions();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("pages.sysadmin.system.selectTimezone")}</option>
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
  const { t } = useI18n();
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
    // Trim free-text fields so a stray space can't drift the saved identity
    // away from what the setup wizard stores (it trims the same fields).
    // Address lines are already trimmed by textToAddr; timezones come from a
    // <Select> so they need no trimming.
    update.mutate(
      {
        instituteName: instituteName.trim() || null,
        instituteAddressLines: textToAddr(addressText),
        instituteContactPhone: phone.trim() || null,
        instituteContactEmail: email.trim() || null,
        appTimezone: appTz || null,
        exportTimezone: exportTz || null,
        masterConsentVersion: consentVersion.trim() || null,
      },
      { onSuccess: () => setDone(true) },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title={t("pages.sysadmin.system.instituteIdentity")}>
        <Field label={t("forms.instituteName")}>
          <Input
            value={instituteName}
            onChange={(e) => setInstituteName(e.target.value)}
            placeholder={t("pages.sysadmin.system.instituteNamePlaceholder")}
          />
        </Field>
        <Field label={t("pages.sysadmin.system.addressLines")}>
          <Textarea
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
            rows={3}
            placeholder={t("pages.sysadmin.system.addressPlaceholder")}
          />
          <Hint>{t("pages.sysadmin.system.addressHint")}</Hint>
        </Field>
        <Field label={t("pages.sysadmin.system.contactPhone")}>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("pages.sysadmin.system.phonePlaceholder")}
          />
        </Field>
        <Field label={t("pages.sysadmin.system.contactEmail")}>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("pages.sysadmin.system.emailPlaceholder")}
          />
        </Field>
      </Section>

      <Section title={t("pages.sysadmin.system.defaults")}>
        <Field label={t("pages.sysadmin.system.appTimezone")}>
          <TimezoneSelect value={appTz} onChange={setAppTz} />
          <Hint>{t("pages.sysadmin.system.appTimezoneHint")}</Hint>
        </Field>
        <Field label={t("pages.sysadmin.system.exportTimezone")}>
          <TimezoneSelect value={exportTz} onChange={setExportTz} />
          <Hint>{t("pages.sysadmin.system.exportTimezoneHint")}</Hint>
        </Field>
        <Field label={t("pages.sysadmin.system.consentVersion")}>
          <Input
            value={consentVersion}
            onChange={(e) => setConsentVersion(e.target.value)}
            placeholder={t("pages.sysadmin.system.consentVersionPlaceholder")}
          />
          <Hint>{t("pages.sysadmin.system.consentVersionHint")}</Hint>
        </Field>
      </Section>

      {update.error ? <ErrorBanner>{explainError(update.error.error)}</ErrorBanner> : null}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={!dirty || update.isPending}>
          {update.isPending ? t("common.saving") : t("common.saveChanges")}
        </Button>
        {done && !dirty ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("common.saved")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
