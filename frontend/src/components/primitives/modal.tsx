"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { Button } from "@/components/primitives/button";
import { cn } from "@/lib/cn";

// Native modal dialogs provide focus containment, focus restoration and nested
// top-layer ordering. Backdrop clicks deliberately do not dismiss forms.
let openDialogs = 0;
let previousOverflow = "";
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  dirty = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Non-input edits, such as cropping or drawing, needing discard confirmation. */
  dirty?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editedRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    editedRef.current = false;
    if (openDialogs++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    dialog.showModal();
    // Start at the heading, not a destructive action or a field midway down.
    dialog.querySelector<HTMLElement>("[data-modal-heading]")?.focus();
    return () => {
      dialog.close();
      if (--openDialogs === 0) document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  const requestClose = () => {
    if (
      (dirty || editedRef.current) &&
      !window.confirm("Discard the unsaved changes in this dialog?")
    )
      return;
    closeRef.current();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : "Dialog"}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onInputCapture={() => {
        editedRef.current = true;
      }}
      onChangeCapture={() => {
        editedRef.current = true;
      }}
      onPointerDownCapture={(event) => {
        if (event.target instanceof HTMLCanvasElement) editedRef.current = true;
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-4 backdrop:bg-[var(--foreground)]/30 backdrop:backdrop-blur-sm sm:p-8"
    >
      {open && (
        <div className="flex h-full items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-xl",
              className,
            )}
          >
            <div className="absolute right-3 top-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={requestClose}
                aria-label="Close dialog"
                className="min-h-11 min-w-11"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5 p-6 pb-3 pr-16">
              <h2
                id={titleId}
                data-modal-heading
                tabIndex={-1}
                className={cn(
                  "text-xl font-semibold tracking-[-0.01em] outline-none",
                  !title && "sr-only",
                )}
              >
                {title ?? "Dialog"}
              </h2>
              {description && (
                <p id={descriptionId} className="text-sm text-[var(--muted-foreground)]">
                  {description}
                </p>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-3">{children}</div>
          </motion.div>
        </div>
      )}
    </dialog>
  );
}
