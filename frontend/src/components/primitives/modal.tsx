"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/primitives/button";
import { cn } from "@/lib/cn";

// Lightweight modal — backdrop fade + content scale-in. No focus trap library;
// for forms-with-submit-button this is fine. Esc to close.
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--foreground)]/30 px-4 backdrop-blur-sm"
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
            className={cn(
              "relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl",
              className,
            )}
          >
            <div className="absolute right-3 top-3">
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {(title || description) && (
              <div className="flex flex-col gap-1.5 p-6 pb-3">
                {title && <h2 className="font-display text-xl tracking-[-0.01em]">{title}</h2>}
                {description && (
                  <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
                )}
              </div>
            )}
            <div className="p-6 pt-3">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
