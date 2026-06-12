"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, RefreshCw, Smartphone, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { API_URL, type ApiError, readCookie } from "@/lib/api";
import { explainError } from "@/lib/error-codes";
import { useCaptureSessionStatus, useCreateCaptureSession } from "@/lib/use-api";
import type { CapturePurpose } from "@/types/api";

const CSRF_HEADER_NAME = "X-CSRF-Token";

// "Scan to use your phone as a camera" popup. Mints a capture session,
// renders the QR a phone scans, and watches the session until photos come
// back. Two behaviours by purpose:
//
//   appointment_attachment → photos land straight on the appointment; we
//       refresh the attachments grid behind the modal as they arrive and
//       show a running count. The operator clicks Done when finished.
//   rubber_stamp → the phone parks one photo server-side; as soon as it
//       arrives we pull the bytes, hand them to onRelayReceived (the stamp
//       editor), and close.
//
// The bytes go phone → server directly; for attachments they never touch
// this computer at all.
export function QrCaptureModal({
  open,
  onClose,
  purpose,
  appointmentId,
  onRelayReceived,
  title,
}: {
  open: boolean;
  onClose: () => void;
  purpose: CapturePurpose;
  appointmentId?: number;
  // Required for the rubber_stamp purpose — receives the pulled photo.
  onRelayReceived?: (file: File) => void;
  title?: string;
}) {
  const qc = useQueryClient();
  const create = useCreateCaptureSession();

  const [session, setSession] = useState<
    { id: number; token: string; expiresAt: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [relayDone, setRelayDone] = useState(false);

  // Guards: avoid double-pulling the relay photo, and remember the last
  // upload count so we only refresh the grid when it actually grows.
  const relayHandledRef = useRef(false);
  const lastCountRef = useRef(0);

  // Fire-and-forget close so the QR stops working the moment we're done.
  const closeSession = (id: number) => {
    const csrf = readCookie("csrf_token");
    fetch(`${API_URL}/capture/sessions/${id}`, {
      method: "DELETE",
      credentials: "include",
      headers: csrf ? { [CSRF_HEADER_NAME]: csrf } : {},
      keepalive: true,
    }).catch(() => {});
  };

  // Mint a session whenever the modal opens; tear it down on close/unmount.
  useEffect(() => {
    if (!open) return;
    let active = true;
    let createdId: number | null = null;
    setError(null);
    setRelayDone(false);
    relayHandledRef.current = false;
    lastCountRef.current = 0;
    setSession(null);

    (async () => {
      try {
        const s = await create.mutateAsync({ purpose, appointmentId });
        if (!active) {
          closeSession(s.id);
          return;
        }
        createdId = s.id;
        setSession({ id: s.id, token: s.token, expiresAt: s.expiresAt });
      } catch (e) {
        if (active) setError(explainError((e as ApiError).error));
      }
    })();

    return () => {
      active = false;
      if (createdId != null) closeSession(createdId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const status = useCaptureSessionStatus(session?.id ?? null, {
    enabled: open && !!session && !relayDone,
  });
  const expired = status.data?.closed ?? false;
  const uploadCount = status.data?.uploadCount ?? 0;

  // React to the polled status: refresh the grid for attachments, or pull
  // the parked photo for the stamp relay.
  useEffect(() => {
    const data = status.data;
    if (!data || data.closed) return;

    if (purpose === "appointment_attachment") {
      if (data.uploadCount > lastCountRef.current) {
        lastCountRef.current = data.uploadCount;
        if (appointmentId != null) {
          qc.invalidateQueries({ queryKey: ["appointments", appointmentId, "attachments"] });
          qc.invalidateQueries({ queryKey: ["appointments", appointmentId] });
        }
      }
      return;
    }

    // rubber_stamp
    if (data.relayReady && !relayHandledRef.current) {
      relayHandledRef.current = true;
      (async () => {
        try {
          const res = await fetch(`${API_URL}/capture/sessions/${data.id}/relay`, {
            credentials: "include",
          });
          if (!res.ok) {
            relayHandledRef.current = false;
            setError("Couldn't retrieve the photo — try scanning the QR again.");
            return;
          }
          const blob = await res.blob();
          const type = blob.type || "image/jpeg";
          const ext = type.includes("png") ? "png" : "jpg";
          onRelayReceived?.(new File([blob], `phone-stamp.${ext}`, { type }));
          setRelayDone(true);
          onClose();
        } catch {
          relayHandledRef.current = false;
          setError("Couldn't retrieve the photo — check your connection and try again.");
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data?.uploadCount, status.data?.relayReady, status.data?.closed]);

  const regenerate = () => {
    if (session) closeSession(session.id);
    setSession(null);
    setError(null);
    relayHandledRef.current = false;
    lastCountRef.current = 0;
    (async () => {
      try {
        const s = await create.mutateAsync({ purpose, appointmentId });
        setSession({ id: s.id, token: s.token, expiresAt: s.expiresAt });
      } catch (e) {
        setError(explainError((e as ApiError).error));
      }
    })();
  };

  const captureUrl =
    session && typeof window !== "undefined"
      ? `${window.location.origin}/capture/${session.token}`
      : null;

  const heading = title ?? "Use your phone as a camera";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--foreground)]/50 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                <Smartphone className="h-4 w-4 text-[var(--accent)]" />
                {heading}
              </span>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-col items-center gap-4 p-6">
              {error ? (
                <div className="flex w-full flex-col gap-3">
                  <ErrorBanner>{error}</ErrorBanner>
                  <Button variant="secondary" onClick={regenerate}>
                    <RefreshCw className="h-4 w-4" />
                    Try again
                  </Button>
                </div>
              ) : !captureUrl ? (
                <div className="flex h-[232px] items-center justify-center text-sm text-[var(--muted-foreground)]">
                  Generating code…
                </div>
              ) : (
                <>
                  <p className="text-center text-sm text-[var(--muted-foreground)]">
                    Scan this with any phone&rsquo;s camera. It opens a page that
                    takes the photo and sends it here — nothing is saved on the
                    phone or this computer.
                  </p>

                  <div className="relative rounded-xl border border-[var(--border)] bg-white p-4">
                    <QRCodeSVG value={captureUrl} size={196} level="M" />
                    {expired && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-[var(--card)]/90 backdrop-blur-sm">
                        <span className="text-sm font-medium">This code expired</span>
                        <Button size="sm" onClick={regenerate}>
                          <RefreshCw className="h-3.5 w-3.5" />
                          New code
                        </Button>
                      </div>
                    )}
                  </div>

                  {purpose === "appointment_attachment" ? (
                    <div className="flex w-full flex-col items-center gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        {uploadCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600">
                            <Check className="h-4 w-4" />
                            {uploadCount} photo{uploadCount === 1 ? "" : "s"} received
                          </span>
                        ) : (
                          <span className="text-[var(--muted-foreground)]">
                            Waiting for the first photo…
                          </span>
                        )}
                      </div>
                      <Button className="w-full" onClick={onClose}>
                        Done
                      </Button>
                    </div>
                  ) : (
                    <p className="text-center text-sm text-[var(--muted-foreground)]">
                      Waiting for the photo… it&rsquo;ll drop into the editor
                      automatically.
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
