"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { Eraser } from "lucide-react";

import { Button } from "@/components/primitives/button";

export type SignatureCanvasHandle = {
  /** Returns a base64 PNG data URL, or null if the canvas is empty. */
  toDataURL(): string | null;
  clear(): void;
};

// Self-contained signature pad — pointer events, HiDPI-aware, exposes a
// `toDataURL` ref method. We track `hasInk` so the parent can disable submit
// until the doctor actually signs (per §1.7 + user-stories requirement).
export const SignatureCanvas = forwardRef<
  SignatureCanvasHandle,
  { onChange?: (hasInk: boolean) => void; height?: number }
>(({ onChange, height = 200 }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // A freshly mounted canvas is always blank — tell the parent immediately so
  // a `signed` flag from a previous mount (e.g. Review → Back → Review, which
  // remounts this component and discards the ink) can't go stale and leave
  // the submit button enabled with nothing to submit.
  useEffect(() => {
    onChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set up the canvas at the device pixel ratio so strokes stay crisp on retina.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [height]);

  useImperativeHandle(ref, () => ({
    toDataURL: () => (hasInk ? canvasRef.current!.toDataURL("image/png") : null),
    clear: () => {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasInk(false);
      onChange?.(false);
    },
  }));

  const pos = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawingRef.current = true;
    canvasRef.current!.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) {
      setHasInk(true);
      onChange?.(true);
    }
  };

  const onPointerUp = () => {
    drawingRef.current = false;
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative overflow-hidden rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card)]"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className="block h-full w-full touch-none cursor-crosshair"
          style={{ touchAction: "none" }}
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]/60">
            Sign here
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={`font-mono uppercase tracking-[0.12em] ${hasInk ? "text-emerald-600" : "text-[var(--muted-foreground)]"}`}>
          {hasInk ? "Signed" : "Not signed yet"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            const canvas = canvasRef.current!;
            const ctx = canvas.getContext("2d")!;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setHasInk(false);
            onChange?.(false);
          }}
        >
          <Eraser className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>
    </div>
  );
});
SignatureCanvas.displayName = "SignatureCanvas";
