"use client";

import { Pencil, Upload, X } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { SignatureCanvas, type SignatureCanvasHandle } from "@/components/doctor/signature-canvas";

// The saved e-signature shares the consultation signature's server policy:
// PNG only, ≤ 200 KB. Uploads are validated here so the capture method
// (upload vs draw) is interchangeable from the backend's point of view.
const MAX_BYTES = 200 * 1024;

type Mode = "upload" | "draw";

// Optional saved-signature capture: upload a PNG or draw on a pad. Emits a
// base64 data URL via onChange (or null when cleared). Reused by the doctor
// registration form and the self-service profile page.
export function SignatureInput({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const padRef = useRef<SignatureCanvasHandle>(null);
  const [mode, setMode] = useState<Mode>("draw");
  const [error, setError] = useState<string | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setError(null);
    if (file.type !== "image/png") {
      setError("Use a PNG image (transparent background works best).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Signature must be under 200 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (result) onChange(result);
    };
    reader.onerror = () => setError("Couldn't read the file. Try again.");
    reader.readAsDataURL(file);
  };

  const captureDrawing = () => {
    const url = padRef.current?.toDataURL() ?? null;
    if (!url) {
      setError("Draw your signature first.");
      return;
    }
    setError(null);
    onChange(url);
  };

  if (value) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="Saved e-signature preview" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-emerald-600">
              Signature ready
            </div>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Applied automatically when you finalise a consultation.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
        {error && <ErrorBanner>{error}</ErrorBanner>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex w-fit gap-1 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-1">
        <ToggleButton Icon={Pencil} label="Draw" selected={mode === "draw"} onClick={() => setMode("draw")} />
        <ToggleButton Icon={Upload} label="Upload" selected={mode === "upload"} onClick={() => setMode("upload")} />
      </div>

      {mode === "draw" ? (
        <div className="flex flex-col gap-2">
          <SignatureCanvas ref={padRef} onChange={setHasInk} />
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="secondary" disabled={!hasInk} onClick={captureDrawing}>
              Use this signature
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="group flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-6 py-10 transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/[0.03]"
        >
          <div className="rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] p-3 text-white shadow-accent transition-transform duration-300 group-hover:scale-110">
            <Upload className="h-5 w-5" />
          </div>
          <div className="text-center">
            <div className="text-sm font-semibold tracking-[-0.01em]">Upload signature</div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
              PNG · &lt; 200 KB · transparent background recommended
            </div>
          </div>
        </button>
      )}

      <input ref={inputRef} type="file" accept="image/png" onChange={handleFile} className="sr-only" />
      {error && <ErrorBanner>{error}</ErrorBanner>}
    </div>
  );
}

function ToggleButton({
  Icon,
  label,
  selected,
  onClick,
}: {
  Icon: typeof Pencil;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        selected
          ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
          : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
