"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Camera, Check, RefreshCw, SwitchCamera } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { API_URL, ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/error-codes";

// Public, token-authenticated "your phone is now a camera" page. Reached by
// scanning the QR a desktop operator shows; the {token} in the path is the
// only credential. No login, no cookies — the page peeks the token, drives
// the phone camera, and POSTs each JPEG straight back to the server.
//
// Purpose-aware copy:
//   appointment_attachment → many photos; stays open so they can keep
//       snapping ("Take another").
//   rubber_stamp → one photo is enough; after it sends we nudge them back
//       to the computer where it appears in the editor.

type PageState =
  | { mode: "loading" }
  | { mode: "invalid"; reason: string }
  | { mode: "ready"; purpose: string }
  | { mode: "sent"; purpose: string };

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.92;

export default function CapturePage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const [state, setState] = useState<PageState>({ mode: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [canSwitch, setCanSwitch] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<File | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const setShotUrl = (url: string | null) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = url;
    setShot(url);
  };

  // Validate the token once on mount.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const peek = await api<{ purpose: string; expiresAt: string }>(
          `/capture/${token}`,
          { skipAuthRedirect: true },
        );
        if (!cancelled) setState({ mode: "ready", purpose: peek.purpose });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
          setState({ mode: "invalid", reason: explainError(err.error) });
        } else {
          setState({
            mode: "invalid",
            reason: "Couldn't reach the server. Try scanning again in a moment.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Run the camera while we're on a capture screen (ready, no shot yet).
  const cameraActive = (state.mode === "ready" || state.mode === "sent") && !shot;
  useEffect(() => {
    if (!cameraActive) return;
    let cancelled = false;
    setError(null);
    setReady(false);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This phone or browser doesn't support camera access.");
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
            ? "Camera access was blocked. Allow camera permission and reload."
            : "Couldn't start the camera. Close other camera apps and try again.",
        );
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraActive, facing]);

  // Clean up on unmount.
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
    const scale = Math.min(1, MAX_DIMENSION / Math.max(vw, vh));
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
        fileRef.current = new File([blob], `phone-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        setShotUrl(URL.createObjectURL(blob));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  };

  const retake = () => {
    setShotUrl(null);
    fileRef.current = null;
  };

  const send = async () => {
    if (!fileRef.current || !token) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", fileRef.current);
      const res = await fetch(`${API_URL}/capture/${token}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        let code = "request_failed";
        try {
          const body = await res.json();
          const inner = body?.detail ?? body;
          if (inner && typeof inner === "object" && "error" in inner) {
            code = String((inner as { error: string }).error);
          }
        } catch {
          /* keep default */
        }
        setError(explainError(code));
        setUploading(false);
        return;
      }
      const purpose = state.mode === "ready" ? state.purpose : "appointment_attachment";
      setShotUrl(null);
      fileRef.current = null;
      setState({ mode: "sent", purpose });
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  const takeAnother = () => {
    if (state.mode === "sent") setState({ mode: "ready", purpose: state.purpose });
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (state.mode === "loading") {
    return (
      <Centered>
        <p className="text-sm text-white/70">Checking the link…</p>
      </Centered>
    );
  }

  if (state.mode === "invalid") {
    return (
      <Centered>
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
          <h1 className="text-lg font-semibold">Link not active</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">{state.reason}</p>
          <p className="mt-4 text-xs text-[var(--muted-foreground)]">
            Ask the person at the computer to show a fresh QR code, then scan again.
          </p>
        </div>
      </Centered>
    );
  }

  const isStamp =
    (state.mode === "ready" || state.mode === "sent") && state.purpose === "rubber_stamp";

  if (state.mode === "sent") {
    return (
      <Centered>
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Check className="h-6 w-6" />
          </div>
          <h1 className="mt-3 text-lg font-semibold">Photo sent</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {isStamp
              ? "It's on its way to the computer — you can put the phone down now."
              : "It's now on the computer. Take more if you need to."}
          </p>
          {!isStamp && (
            <Button className="mt-5 w-full" onClick={takeAnother}>
              <Camera className="h-4 w-4" />
              Take another photo
            </Button>
          )}
        </div>
      </Centered>
    );
  }

  // mode === "ready"
  return (
    <div className="flex min-h-[100dvh] flex-col bg-black">
      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 text-center text-sm text-white/80">
        {isStamp ? "Take a clear photo of the rubber stamp" : "Take a photo for the doctor"}
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={"h-full w-full object-contain " + (shot ? "hidden" : "block")}
        />
        {shot && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={shot} alt="Captured" className="h-full w-full object-contain" />
        )}
        {!ready && !shot && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            Starting camera…
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <div className="flex items-center justify-center gap-3">
          {shot ? (
            <>
              <Button variant="secondary" onClick={retake} disabled={uploading}>
                <RefreshCw className="h-4 w-4" />
                Retake
              </Button>
              <Button onClick={send} disabled={uploading}>
                <Check className="h-4 w-4" />
                {uploading ? "Sending…" : "Send photo"}
              </Button>
            </>
          ) : (
            <>
              {canSwitch && (
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                  aria-label="Switch camera"
                >
                  <SwitchCamera className="h-4 w-4" />
                </Button>
              )}
              <Button size="lg" onClick={capture} disabled={!ready}>
                <Camera className="h-5 w-5" />
                Capture
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--foreground)] p-6">
      {children}
    </div>
  );
}
