"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Eraser, Upload } from "lucide-react";

import { RubberStampEditor } from "@/components/admin/rubber-stamp-editor";
import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Modal } from "@/components/primitives/modal";

const MAX_OUTPUT_BYTES = 200 * 1024;
type Point = { x: number; y: number };
type Stroke = Point[];

function pngBytes(url: string) {
  const data = url.slice(url.indexOf(",") + 1);
  return Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
}

export type SignaturePadHandle = {
  /** Patient signature as a PNG ≤200 KiB, or null if empty. */
  toDataURL(): string | null;
  clear(): void;
  isEmpty(): boolean;
};

type Props = {
  onChange?: (isEmpty: boolean) => void;
  disabled?: boolean;
  height?: number;
  label?: string;
};

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { onChange, disabled, height = 180, label = "Signature" },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Normalized strokes, not the resizeable backing store, are the artifact.
  const strokesRef = useRef<Stroke[]>([]);
  const currentStroke = useRef<Stroke | null>(null);
  const captureWidthRef = useRef(0);
  const uploadedRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [empty, setEmpty] = useState(true);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [editorSource, setEditorSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const helpId = useId();

  const renderStrokes = useCallback(
    (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const logicalWidth = captureWidthRef.current || canvas.clientWidth || 600;
      const scale = Math.min(canvas.width / logicalWidth, canvas.height / height);
      const inkWidth = logicalWidth * scale;
      const inkHeight = height * scale;
      const offsetX = (canvas.width - inkWidth) / 2;
      const offsetY = (canvas.height - inkHeight) / 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(1, 2 * scale);
      ctx.strokeStyle = "#0f172a";
      for (const stroke of strokesRef.current) {
        if (!stroke.length) continue;
        ctx.beginPath();
        ctx.moveTo(offsetX + stroke[0].x * inkWidth, offsetY + stroke[0].y * inkHeight);
        if (stroke.length === 1) {
          ctx.lineTo(
            offsetX + stroke[0].x * inkWidth + 0.1,
            offsetY + stroke[0].y * inkHeight + 0.1,
          );
        } else {
          for (let index = 1; index < stroke.length; index++) {
            const point = stroke[index];
            ctx.lineTo(offsetX + point.x * inkWidth, offsetY + point.y * inkHeight);
          }
        }
        ctx.stroke();
      }
    },
    [height],
  );

  useEffect(() => {
    if (uploaded) return;
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, parent.clientWidth);
      if (!captureWidthRef.current) captureWidthRef.current = width;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      renderStrokes(canvas);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(parent);
    window.addEventListener("resize", fit);
    let resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const dprChanged = () => {
      resolution.removeEventListener("change", dprChanged);
      fit();
      resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      resolution.addEventListener("change", dprChanged);
    };
    resolution.addEventListener("change", dprChanged);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      resolution.removeEventListener("change", dprChanged);
    };
  }, [height, renderStrokes, uploaded]);

  const notify = (isEmpty: boolean) => {
    setEmpty(isEmpty);
    onChangeRef.current?.(isEmpty);
  };
  const clear = () => {
    currentStroke.current = null;
    strokesRef.current = [];
    uploadedRef.current = null;
    setUploaded(null);
    setError(null);
    if (canvasRef.current) renderStrokes(canvasRef.current);
    notify(true);
  };
  const exportSignature = () => {
    if (uploadedRef.current) return uploadedRef.current;
    if (!strokesRef.current.length) return null;
    const source = canvasRef.current;
    if (!source) return null;
    const output = document.createElement("canvas");
    const width = captureWidthRef.current || 600;
    const initialScale = Math.min(1, 1000 / width);
    for (let scale = initialScale; scale >= initialScale / 4; scale /= 2) {
      output.width = Math.max(1, Math.round(width * scale));
      output.height = Math.max(1, Math.round(height * scale));
      renderStrokes(output);
      const url = output.toDataURL("image/png");
      if (pngBytes(url) <= MAX_OUTPUT_BYTES) return url;
    }
    setError("Signature exceeds 200 KiB. Clear and sign again, or upload a tightly cropped image.");
    return null;
  };
  useImperativeHandle(ref, () => ({
    toDataURL: exportSignature,
    clear,
    isEmpty: () => !uploadedRef.current && !strokesRef.current.length,
  }));

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    const logicalWidth = captureWidthRef.current || rect.width;
    const scale = Math.min(rect.width / logicalWidth, rect.height / height);
    const inkWidth = logicalWidth * scale;
    const inkHeight = height * scale;
    return {
      x: Math.max(
        0,
        Math.min(1, (event.clientX - rect.left - (rect.width - inkWidth) / 2) / inkWidth),
      ),
      y: Math.max(
        0,
        Math.min(1, (event.clientY - rect.top - (rect.height - inkHeight) / 2) / inkHeight),
      ),
    };
  };
  const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    currentStroke.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" /> Upload patient signature
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={clear}
            disabled={disabled || empty}
          >
            <Eraser className="h-4 w-4" /> Clear
          </Button>
        </div>
      </div>
      <p id={helpId} className="text-sm text-[var(--muted-foreground)]">
        Ask the patient to draw their signature with a finger or stylus, or upload an image of their
        actual signature. An uploaded signature is cropped before use.
      </p>
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-inner">
        {uploaded ? (
          <img
            src={uploaded}
            alt="Captured patient signature"
            className="w-full object-contain"
            style={{ height }}
          />
        ) : (
          <canvas
            ref={canvasRef}
            onPointerDown={(event) => {
              if (disabled || currentStroke.current) return;
              event.preventDefault();
              if (!strokesRef.current.length)
                captureWidthRef.current = event.currentTarget.getBoundingClientRect().width;
              const stroke = [pointAt(event)];
              strokesRef.current.push(stroke);
              currentStroke.current = stroke;
              event.currentTarget.setPointerCapture(event.pointerId);
              renderStrokes(event.currentTarget);
              if (empty) notify(false);
            }}
            onPointerMove={(event) => {
              if (!currentStroke.current || disabled) return;
              currentStroke.current.push(pointAt(event));
              renderStrokes(event.currentTarget);
            }}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            className="block touch-none"
            style={{ cursor: disabled ? "not-allowed" : "crosshair" }}
            aria-label={`${label} drawing area; use Upload patient signature for keyboard capture`}
            aria-describedby={helpId}
            role="img"
          />
        )}
      </div>
      <p role="status" className="text-sm font-medium text-[var(--muted-foreground)]">
        {empty
          ? "No patient signature captured."
          : uploaded
            ? "Uploaded patient signature ready."
            : "Drawn patient signature ready."}
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        aria-label="Upload image of patient signature"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 1_000_000) {
            setError("Use a PNG or JPEG image under 1 MB.");
            return;
          }
          const reader = new FileReader();
          reader.onerror = () => setError("Could not read the image. Choose it again.");
          reader.onload = () => {
            if (typeof reader.result === "string") {
              setError(null);
              setEditorSource(reader.result);
            }
          };
          reader.readAsDataURL(file);
        }}
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Modal
        open={!!editorSource}
        dirty
        onClose={() => setEditorSource(null)}
        title="Crop patient signature"
        description="Use the patient's actual signature. Crop around it without changing its meaning."
        className="max-w-3xl"
      >
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {editorSource && (
          <RubberStampEditor
            source={editorSource}
            description="Crop tightly around the patient's signature. The final PNG must be no larger than 200 KiB."
            forcePng
            onCancel={() => setEditorSource(null)}
            onSave={(url) => {
              if (pngBytes(url) > MAX_OUTPUT_BYTES) {
                setError(
                  "Cropped signature exceeds 200 KiB. Crop tighter or remove the paper background.",
                );
                return;
              }
              uploadedRef.current = url;
              strokesRef.current = [];
              setUploaded(url);
              setEditorSource(null);
              setError(null);
              notify(false);
            }}
          />
        )}
      </Modal>
    </div>
  );
});
