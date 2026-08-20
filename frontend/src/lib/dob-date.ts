const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function maskDobInput(raw: string, previous = ""): string {
  const deleting = raw.length < previous.length;
  const iso = raw.match(ISO_DATE);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const cleaned = raw.replace(/[-.\s]/g, "/").replace(/[^\d/]/g, "");

  if (!cleaned.includes("/")) {
    const digits = cleaned.slice(0, 8);
    return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)]
      .filter(Boolean)
      .join("/") + (!deleting && (digits.length === 2 || digits.length === 4) ? "/" : "");
  }

  const [day = "", month = "", year = ""] = cleaned.split("/", 3);
  const masked = [day.slice(0, 2), month.slice(0, 2), year.slice(0, 4)]
    .join("/")
    .replace(/\/+$/, cleaned.endsWith("/") ? "/" : "");
  return !deleting && month.length === 2 && !year && !masked.endsWith("/") ? `${masked}/` : masked;
}

export function parseDob(value: string | undefined): string | null {
  if (!value?.trim()) return null;

  const parts = value.trim().replace(/[-.\s]+/g, "/").split("/");
  if (parts.length !== 3 || !parts.every((part) => /^\d+$/.test(part))) return null;

  const [day, month, year] = parts.map(Number);
  if (parts[2].length !== 4 || year < 1 || month < 1 || month > 12 || day < 1) return null;

  const candidate = new Date(0);
  candidate.setUTCHours(0, 0, 0, 0);
  candidate.setUTCFullYear(year, month - 1, day);
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function displayDob(iso: string | null | undefined): string {
  const match = iso?.match(ISO_DATE);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}
