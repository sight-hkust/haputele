"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/primitives/button";
import { cn } from "@/lib/cn";

// Lightweight modal — backdrop fade + content scale-in. No focus trap library;
// for forms-with-submit-button this is fine. Closes ONLY via the X button (or an
// explicit in-content action) — a backdrop click or Esc no longer dismisses it,
// so half-typed forms aren't lost to a stray click outside the box.
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  // Lock body scroll while open. Esc intentionally does not close — see header.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--foreground)]/30 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl",
              className,
            )}
          >
            <div className="absolute right-3 top-3">
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {(title || description) && (
              <div className="flex shrink-0 flex-col gap-1.5 p-6 pb-3">
                {title && <h2 className="font-display text-xl tracking-[-0.01em]">{title}</h2>}
                {description && (
                  <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
                )}
              </div>
            )}
            {/* Only the body scrolls; the header above stays pinned so the title and the
                close button remain reachable. Without this the panel had no height bound
                at all, so tall content (the rubber-stamp editor worst of all) ran off both
                ends of the viewport with body scroll locked — nothing could reach the save
                button. Mirrors image-preview / camera-capture / qr-capture modals. */}
            <div className="flex-1 overflow-y-auto p-6 pt-3">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
