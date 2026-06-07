"use client";

import { Camera, Pencil, Stamp, Upload, X } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/primitives/button";
import { CameraCaptureModal } from "@/components/primitives/camera-capture-modal";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Modal } from "@/components/primitives/modal";
import { RubberStampEditor } from "@/components/admin/rubber-stamp-editor";

const MAX_BYTES = 1_000_000; // 1 MB — keeps the patient PDF lean
const ACCEPTED = ["image/png", "image/jpeg"];

// Reads a file → base64 data URL (`data:image/png;base64,…`). The backend
// strips the data: prefix on its own, so either form is acceptable.
export function RubberStampUploader({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editorSource, setEditorSource] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Validate then read a file → base64 data URL → open the editor. Shared by
  // the file picker and the camera capture.
  const processFile = (file: File) => {
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("Use a PNG or JPEG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be under 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (result) setEditorSource(result);
    };
    reader.onerror = () => setError("Couldn't read the file. Try again.");
    reader.readAsDataURL(file);
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file twice still triggers onChange.
    e.target.value = "";
    if (file) processFile(file);
  };

  return (
    <div className="flex flex-col gap-3">
      {value ? (
        <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            aria-label="View rubber stamp at full size"
            title="Click to enlarge"
            className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 transition-colors hover:border-[var(--accent)]/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="Rubber stamp preview" className="max-h-full max-w-full object-contain" />
          </button>
          <div className="flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-emerald-600">
              Stamp captured
            </div>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Reproduced on every prescription PDF.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditorSource(value)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Replace
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setCameraOpen(true)}
            >
              <Camera className="h-3.5 w-3.5" />
              Take photo
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="group flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--muted)]/30 px-6 py-10 transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/[0.03]"
          >
            <div className="rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] p-3 text-white shadow-accent transition-transform duration-300 group-hover:scale-110">
              <Stamp className="h-5 w-5" />
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold tracking-[-0.01em]">Upload rubber stamp</div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
                PNG or JPEG · &lt; 1 MB · crop &amp; remove background after upload
              </div>
            </div>
          </button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-center"
            onClick={() => setCameraOpen(true)}
          >
            <Camera className="h-3.5 w-3.5" />
            Take a photo instead
          </Button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        onChange={handleFile}
        className="sr-only"
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Modal
        open={previewOpen && !!value}
        onClose={() => setPreviewOpen(false)}
        title="Rubber stamp"
        description="Reproduced at this size on every prescription PDF."
        className="max-w-2xl"
      >
        <div className="flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value ?? ""}
            alt="Rubber stamp full size"
            className="max-h-[60vh] max-w-full object-contain"
          />
        </div>
      </Modal>

      <Modal
        open={!!editorSource}
        onClose={() => setEditorSource(null)}
        title="Edit rubber stamp"
        className="max-w-3xl"
      >
        {editorSource && (
          <RubberStampEditor
            source={editorSource}
            onCancel={() => setEditorSource(null)}
            onSave={(next) => {
              onChange(next);
              setEditorSource(null);
            }}
          />
        )}
      </Modal>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={processFile}
        maxDimension={1280}
        quality={0.9}
        filename="rubber-stamp.jpg"
      />
    </div>
  );
}
