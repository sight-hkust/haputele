"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/primitives/button";

// Full-screen image lightbox — backdrop fade + image scale-in. Esc or backdrop
// click to close. Mirrors the interaction model of the shared Modal but is
// tailored for images: large object-contain preview with an optional caption,
// so attachments open in-app instead of a raw new-tab file view.
export function ImagePreviewModal({
  open,
  onClose,
  src,
  alt,
  caption,
}: {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  caption?: string | null;
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--foreground)]/60 p-4 backdrop-blur-sm sm:p-8"
          onClick={onClose}
          role="dialog"
          aria-modal
        >
          <div className="absolute right-4 top-4 z-10">
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close preview">
              <X className="h-5 w-5" />
            </Button>
          </div>
          <motion.figure
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full max-w-5xl flex-col items-center gap-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-[85vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
            />
            {caption && (
              <figcaption className="max-w-full rounded-lg bg-[var(--card)]/90 px-3 py-1.5 text-center text-sm text-[var(--foreground)] shadow">
                {caption}
              </figcaption>
            )}
          </motion.figure>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
