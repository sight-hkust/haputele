"use client";

import { RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import { Button } from "@/components/primitives/button";

const DEFAULT_THRESHOLD = 240; // luminance cutoff (0–255); brighter pixels become transparent

export function RubberStampEditor({
  source,
  onCancel,
  onSave,
}: {
  source: string;
  onCancel: () => void;
  onSave: (next: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completed, setCompleted] = useState<PixelCrop>();
  const [removeBg, setRemoveBg] = useState(true);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  // Rotation is split: `coarse` snaps to 90° via the buttons, `fine` is the
  // ±15° slider for straightening. Effective angle = coarse + fine.
  // Always pivots around the ORIGINAL source so successive rotations don't
  // compound encoding artefacts.
  const [coarse, setCoarse] = useState(0);
  const [fine, setFine] = useState(0);
  const [displaySrc, setDisplaySrc] = useState(source);
  const [rotating, setRotating] = useState(false);
  const totalRotation = coarse + fine;

  // Reset when caller changes the underlying image (e.g. picked a new file).
  useEffect(() => {
    setCoarse(0);
    setFine(0);
    setDisplaySrc(source);
  }, [source]);

  // Re-render the rotated source. Debounced 60 ms so dragging the fine slider
  // doesn't fire toDataURL() on every pointermove.
  useEffect(() => {
    if (totalRotation === 0) {
      setDisplaySrc(source);
      setRotating(false);
      return;
    }
    let cancelled = false;
    setRotating(true);
    const timer = window.setTimeout(() => {
      rotateImage(source, totalRotation)
        .then((next) => {
          if (!cancelled) setDisplaySrc(next);
        })
        .finally(() => {
          if (!cancelled) setRotating(false);
        });
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, totalRotation]);

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    // Start with the entire image selected — admin can drag inward to crop.
    setCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
    setCompleted({ unit: "px", x: 0, y: 0, width: img.width, height: img.height });
  };

  const rotate90 = (delta: 90 | -90) => setCoarse((c) => c + delta);

  useEffect(() => {
    const img = imgRef.current;
    const cv = previewRef.current;
    if (!img || !cv || !completed || completed.width === 0 || completed.height === 0) return;
    drawProcessed(img, completed, removeBg, threshold, cv);
  }, [completed, removeBg, threshold]);

  const handleSave = () => {
    const img = imgRef.current;
    if (!img || !completed) return;
    const out = document.createElement("canvas");
    drawProcessed(img, completed, removeBg, threshold, out);
    onSave(out.toDataURL("image/png"));
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-[var(--muted-foreground)]">
        Crop the stamp tightly. Optionally remove the white paper background so it lays cleanly on the prescription.
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-3">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompleted(c)}
              keepSelection
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={displaySrc}
                onLoad={onImgLoad}
                alt="Editing rubber stamp"
                className="max-h-[55vh] max-w-full select-none"
              />
            </ReactCrop>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => rotate90(-90)}>
                <RotateCcw className="h-3.5 w-3.5" />
                Rotate left
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => rotate90(90)}>
                <RotateCw className="h-3.5 w-3.5" />
                Rotate right
              </Button>
              {totalRotation !== 0 && (
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
                  {formatAngle(totalRotation)}°
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                <span>Fine angle (straighten)</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{fine.toFixed(1)}°</span>
                  {fine !== 0 && (
                    <button
                      type="button"
                      onClick={() => setFine(0)}
                      className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--accent)] hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                min={-15}
                max={15}
                step={0.1}
                value={fine}
                onChange={(e) => setFine(parseFloat(e.target.value))}
                className="w-full accent-[var(--accent)]"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
              Preview
            </div>
            <div
              className="flex h-32 items-center justify-center rounded-xl border border-[var(--border)] p-2"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, rgba(0,0,0,.06) 25%, transparent 25%), linear-gradient(-45deg, rgba(0,0,0,.06) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(0,0,0,.06) 75%), linear-gradient(-45deg, transparent 75%, rgba(0,0,0,.06) 75%)",
                backgroundSize: "10px 10px",
                backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0px",
              }}
            >
              <canvas ref={previewRef} className="max-h-full max-w-full" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={removeBg}
              onChange={(e) => setRemoveBg(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
            />
            Remove white background
          </label>

          {removeBg && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                <span>Threshold</span>
                <span className="font-mono">{threshold}</span>
              </div>
              <input
                type="range"
                min={120}
                max={255}
                step={1}
                value={threshold}
                onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
                className="w-full accent-[var(--accent)]"
              />
              <p className="text-[11px] leading-snug text-[var(--muted-foreground)]">
                Higher = more aggressive (drops grey paper). Lower = preserves faint ink.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={!completed || completed.width === 0 || rotating}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}

function formatAngle(deg: number): string {
  // Normalise to (-180, 180] for display so 270° reads as -90° etc.
  let a = ((deg + 180) % 360 + 360) % 360 - 180;
  // Avoid `-0.0` slipping into the label.
  if (Object.is(a, -0)) a = 0;
  return a.toFixed(1).replace(/\.0$/, "");
}

// Rotate `srcDataUrl` by `degrees` (any angle — buttons snap to 90°, the
// fine slider supplies the rest). Always re-rotates from the caller's
// original source so successive rotations don't compound encoding artefacts.
async function rotateImage(srcDataUrl: string, degrees: number): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("rotate_load_failed"));
    img.src = srcDataUrl;
  });
  const rad = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const cw = Math.round(w * cos + h * sin);
  const ch = Math.round(w * sin + h * cos);
  const cv = document.createElement("canvas");
  cv.width = cw;
  cv.height = ch;
  const ctx = cv.getContext("2d");
  if (!ctx) return srcDataUrl;
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  return cv.toDataURL("image/png");
}

function drawProcessed(
  img: HTMLImageElement,
  crop: PixelCrop,
  removeBg: boolean,
  threshold: number,
  canvas: HTMLCanvasElement,
) {
  // PixelCrop is in DISPLAYED pixels; scale to the natural image to preserve resolution.
  const scaleX = img.naturalWidth / img.width;
  const scaleY = img.naturalHeight / img.height;
  const sx = crop.x * scaleX;
  const sy = crop.y * scaleY;
  const sw = crop.width * scaleX;
  const sh = crop.height * scaleY;

  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  if (!removeBg) return;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    // Rec. 601 luminance — closer to perceived brightness than a flat average.
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (lum >= threshold) px[i + 3] = 0;
  }
  ctx.putImageData(data, 0, 0);
}
