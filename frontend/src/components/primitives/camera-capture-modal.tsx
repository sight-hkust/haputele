"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Camera, Check, RefreshCw, SwitchCamera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";

// Live-camera capture as a popup window. Opens the device camera with
// getUserMedia, lets the user snap a frame, review it, then hands back a JPEG
// File via onCapture. Downscales to `maxDimension` so captures stay small.
// Works anywhere a regular file upload does — both desktop webcams and mobile
// front/back cameras (with a flip control when more than one is available).
export function CameraCaptureModal({
  open,
  onClose,
  onCapture,
  maxDimension = 1920,
  quality = 0.92,
  filename = "photo.jpg",
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  maxDimension?: number;
  quality?: number;
  filename?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<File | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [canSwitch, setCanSwitch] = useState(false);

  const setShotUrl = (url: string | null) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = url;
    setShot(url);
  };

  // Esc to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Start/stop the stream as the modal opens or the camera is flipped. We keep
  // the stream live after a shot so "Retake" is instant.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setReady(false);

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This device or browser doesn't support camera capture.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
        navigator.mediaDevices
          .enumerateDevices()
          .then((ds) => {
            if (!cancelled) {
              setCanSwitch(ds.filter((d) => d.kind === "videoinput").length > 1);
            }
          })
          .catch(() => {});
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera access was blocked. Allow camera permission in your browser and try again."
            : "Couldn't start the camera. Make sure no other app is using it.",
        );
      }
    };
    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, facing]);

  // Reset the captured shot whenever the modal closes.
  useEffect(() => {
    if (!open) {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      setShot(null);
      fileRef.current = null;
    }
  }, [open]);

  // Revoke any lingering object URL on unmount.
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const { videoWidth: vw, videoHeight: vh } = video;
    const scale = Math.min(1, maxDimension / Math.max(vw, vh));
    const cw = Math.round(vw * scale);
    const ch = Math.round(vh * scale);
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, cw, ch);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Couldn't capture the photo. Try again.");
          return;
        }
        fileRef.current = new File([blob], filename, { type: "image/jpeg" });
        setShotUrl(URL.createObjectURL(blob));
      },
      "image/jpeg",
      quality,
    );
  };

  const retake = () => {
    setShotUrl(null);
    fileRef.current = null;
  };

  const usePhoto = () => {
    if (fileRef.current) onCapture(fileRef.current);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--foreground)]/50 p-4 backdrop-blur-sm sm:p-8"
          onClick={onClose}
          role="dialog"
          aria-modal
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <span className="text-sm font-medium text-[var(--foreground)]">Take a photo</span>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close camera">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-1 items-center justify-center overflow-hidden bg-black p-0">
              <div className="relative flex aspect-[4/3] w-full items-center justify-center">
                {/* Live preview — hidden once a shot is taken. */}
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={
                    "h-full w-full object-contain " + (shot ? "hidden" : "block")
                  }
                />
                {shot && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={shot} alt="Captured photo" className="h-full w-full object-contain" />
                )}
                {!ready && !shot && !error && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
                    Starting camera…
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 p-4">
              {error && <ErrorBanner>{error}</ErrorBanner>}
              <div className="flex items-center justify-center gap-2">
                {shot ? (
                  <>
                    <Button type="button" variant="secondary" onClick={retake}>
                      <RefreshCw className="h-4 w-4" />
                      Retake
                    </Button>
                    <Button type="button" onClick={usePhoto}>
                      <Check className="h-4 w-4" />
                      Use photo
                    </Button>
                  </>
                ) : (
                  <>
                    {canSwitch && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                        aria-label="Switch camera"
                      >
                        <SwitchCamera className="h-4 w-4" />
                      </Button>
                    )}
                    <Button type="button" onClick={capture} disabled={!ready}>
                      <Camera className="h-4 w-4" />
                      Capture
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
