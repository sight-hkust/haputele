"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/primitives/button";

// Image lightbox styled as a popup window — a framed panel with a header bar
// (title + an explicit X close button) and the image in the body. Esc or
// backdrop click also close. Used so attachments open in-app instead of a raw
// new-tab file view.
export function ImagePreviewModal({
  open,
  onClose,
  src,
  alt,
  title,
}: {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  title?: string | null;
}) {
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
            className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <span className="truncate text-sm font-medium text-[var(--foreground)]" title={title ?? alt}>
                {title ?? alt}
              </span>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close preview">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto bg-[var(--muted)]/40 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                className="max-h-[78vh] w-auto max-w-full rounded-lg object-contain"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
