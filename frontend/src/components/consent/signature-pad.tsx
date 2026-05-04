"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";

import { Button } from "@/components/primitives/button";

// FEEDBACK §1: a "click to consent" loses legal meaning. This component is the
// patient's actual artifact — a PNG of the canvas strokes — submitted with the
// consent record. Kept dependency-free: pointer events handle mouse, finger,
// and stylus alike on the HW tablet.

export type SignaturePadHandle = {
  /** PNG data URL of the current canvas, or null if the pad is empty. */
  toDataURL(): string | null;
  /** Erases all strokes. */
  clear(): void;
  /** True before any stroke has been drawn (or after clear). */
  isEmpty(): boolean;
};

type Props = {
  /** Called whenever the empty/non-empty state flips. Lets parents enable/disable submit. */
  onChange?: (isEmpty: boolean) => void;
  /** Disables drawing (e.g. while a network call is in flight). */
  disabled?: boolean;
  /** Display height in px. Width is fluid via parent container. */
  height?: number;
  /** ARIA / form label affordance. */
  label?: string;
};

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { onChange, disabled, height = 180, label = "Signature" },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const dirtyRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const dprRef = useRef(1);
  const [empty, setEmpty] = useState(true);

  const markDirty = useCallback(() => {
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      setEmpty(false);
      onChange?.(false);
    }
  }, [onChange]);

  const resetCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = dprRef.current || 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0f172a";
  }, []);

  // Resize observer keeps the backing-store crisp on DPR changes (e.g.
  // dragging the window between monitors). Resets are destructive — the
  // signature clears on resize. Acceptable for the consent flow: the modal
  // doesn't resize during normal use.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const fit = () => {
      const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
      dprRef.current = dpr;
      const cssWidth = parent.clientWidth;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(height * dpr);
      resetCanvas();
      dirtyRef.current = false;
      setEmpty(true);
      onChange?.(true);
    };

    fit();
    const obs = new ResizeObserver(fit);
    obs.observe(parent);
    return () => obs.disconnect();
  }, [height, onChange, resetCanvas]);

  const pointerXY = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    drawingRef.current = true;
    const pt = pointerXY(e);
    lastRef.current = pt;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    // a single tap leaves a dot — draw a tiny line to make it visible.
    ctx.lineTo(pt.x + 0.1, pt.y + 0.1);
    ctx.stroke();
    markDirty();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pt = pointerXY(e);
    ctx.beginPath();
    if (lastRef.current) ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastRef.current = pt;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastRef.current = null;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* releasing a pointer we never captured is fine */
    }
  };

  useImperativeHandle(ref, () => ({
    toDataURL: () => {
      if (!dirtyRef.current) return null;
      return canvasRef.current?.toDataURL("image/png") ?? null;
    },
    clear: () => {
      resetCanvas();
      dirtyRef.current = false;
      setEmpty(true);
      onChange?.(true);
    },
    isEmpty: () => !dirtyRef.current,
  }));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
          {label}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            resetCanvas();
            dirtyRef.current = false;
            setEmpty(true);
            onChange?.(true);
          }}
          disabled={disabled || empty}
        >
          <Eraser className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          className="block touch-none"
          style={{ cursor: disabled ? "not-allowed" : "crosshair" }}
          aria-label={label}
          role="img"
        />
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Ask the patient to sign above using a finger or stylus on the screen.
      </p>
    </div>
  );
});
