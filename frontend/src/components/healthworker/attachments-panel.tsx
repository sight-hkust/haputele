"use client";

import { useRef, useState } from "react";
import { Camera, Smartphone, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { CameraCaptureModal } from "@/components/primitives/camera-capture-modal";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { ImagePreviewModal } from "@/components/primitives/image-preview-modal";
import { QrCaptureModal } from "@/components/primitives/qr-capture-modal";
import { ApiError } from "@/lib/api";
import { explainError } from "@/lib/error-codes";
import {
  useAttachmentImage,
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
} from "@/lib/use-api";
import { useFileDrop } from "@/lib/use-file-drop";
import type { AppointmentStatus, AttachmentMeta } from "@/types/api";

const READONLY_STATES: AppointmentStatus[] = ["completed", "cancelled"];
const ACCEPT = "image/jpeg,image/png,image/webp";

export function AttachmentsPanel({
  appointmentId,
  status,
}: {
  appointmentId: number;
  status: AppointmentStatus;
}) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const list = useAttachments(appointmentId);
  const upload = useUploadAttachment(appointmentId);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const readonly = READONLY_STATES.includes(status);

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadError(null);
    // Sequential uploads — keeps the UI responsive and one bad file doesn't
    // abort the rest. The mutation hook invalidates the cache per success.
    for (const file of files) {
      try {
        await upload.mutateAsync({ file });
      } catch (err) {
        const e = err as ApiError;
        setUploadError(explainError(e.error));
        break;
      }
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    await uploadFiles(Array.from(files));
    if (fileInput.current) fileInput.current.value = "";
  };

  // Drag photos straight onto the card to upload them — disabled once the
  // appointment is locked or while an upload is already in flight.
  const { isDragging, dropProps } = useFileDrop((files) => uploadFiles(files), {
    multiple: true,
    disabled: readonly || upload.isPending,
  });

  return (
    <Card
      variant="elevated"
      {...dropProps}
      className={
        "p-6 transition-colors " +
        (isDragging ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--background)]" : "")
      }
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-xl bg-[var(--accent)]/10 p-2">
          <Camera className="h-5 w-5 text-[var(--accent)]" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold tracking-[-0.01em]">Photos for the doctor</h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {readonly
              ? "Locked — the appointment has ended."
              : "Wounds, skin conditions, visible injuries — anything the doctor should see before the call."}
          </p>
        </div>
        {!readonly && (
          <div className="flex shrink-0 gap-2">
            <Button
              variant="secondary"
              onClick={() => setCameraOpen(true)}
              disabled={upload.isPending}
              size="sm"
            >
              <Camera className="h-3.5 w-3.5" />
              Take photo
            </Button>
            <Button
              variant="secondary"
              onClick={() => setQrOpen(true)}
              disabled={upload.isPending}
              size="sm"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Use phone
            </Button>
            <Button
              onClick={() => fileInput.current?.click()}
              disabled={upload.isPending}
              size="sm"
            >
              <Upload className="h-3.5 w-3.5" />
              {upload.isPending ? "Uploading…" : "Add photos"}
            </Button>
          </div>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {uploadError && <ErrorBanner className="mb-4">{uploadError}</ErrorBanner>}

      {list.data && list.data.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {list.data.map((a) => (
            <AttachmentThumb
              key={a.id}
              attachment={a}
              appointmentId={appointmentId}
              readonly={readonly}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          {readonly ? "No photos." : "No photos yet — drag photos here or use the buttons above."}
        </p>
      )}

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => uploadFiles([file])}
        filename={`photo-${Date.now()}.jpg`}
      />

      <QrCaptureModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        purpose="appointment_attachment"
        appointmentId={appointmentId}
        title="Snap photos from a phone"
      />
    </Card>
  );
}

function AttachmentThumb({
  attachment,
  appointmentId,
  readonly,
}: {
  attachment: AttachmentMeta;
  appointmentId: number;
  readonly: boolean;
}) {
  const { url, error } = useAttachmentImage(appointmentId, attachment.id);
  const remove = useDeleteAttachment(appointmentId);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState(false);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)]/30">
      <div className="aspect-square w-full">
        {url ? (
          <>
            <button
              type="button"
              onClick={() => setPreview(true)}
              title={attachment.caption || attachment.filename}
              className="block h-full w-full cursor-zoom-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={attachment.caption || attachment.filename}
                className="h-full w-full object-cover"
              />
            </button>
            <ImagePreviewModal
              open={preview}
              onClose={() => setPreview(false)}
              src={url}
              alt={attachment.caption || attachment.filename}
              title={attachment.caption || attachment.filename}
            />
          </>
        ) : error ? (
          <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-rose-600">
            Couldn&rsquo;t load image.
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--muted-foreground)]">
            Loading…
          </div>
        )}
      </div>
      <div className="flex items-start justify-between gap-2 p-3 text-xs">
        <span className="truncate text-[var(--muted-foreground)]" title={attachment.filename}>
          {attachment.filename}
        </span>
        {!readonly && (
          <button
            type="button"
            onClick={() => {
              if (confirming) {
                remove.mutate(attachment.id);
                setConfirming(false);
              } else {
                setConfirming(true);
                setTimeout(() => setConfirming(false), 3000);
              }
            }}
            disabled={remove.isPending}
            className={
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors " +
              (confirming
                ? "bg-rose-600 text-white"
                : "text-[var(--muted-foreground)] hover:bg-rose-50 hover:text-rose-700")
            }
          >
            <Trash2 className="h-3 w-3" />
            {confirming ? "Confirm" : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}
