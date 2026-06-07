"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/primitives/button";
import { cn } from "@/lib/cn";

// Right-hand slide-over panel. Sibling of Modal, but anchored to the edge and
// sized for detail/edit content (forms, long field lists). Backdrop fade +
// panel slide-in; Esc to close, click-outside to close, body scroll locked.
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  // Optional sticky footer (action bar) pinned to the bottom of the panel.
  footer?: ReactNode;
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
          className="fixed inset-0 z-50 flex justify-end bg-[var(--foreground)]/30 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal
        >
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex h-full w-full max-w-xl flex-col border-l border-[var(--border)] bg-[var(--card)] shadow-2xl",
              className,
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] p-6">
              <div className="flex min-w-0 flex-col gap-1">
                {title && <h2 className="font-display text-xl tracking-[-0.01em]">{title}</h2>}
                {description && (
                  <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 shrink-0">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">{children}</div>

            {footer && (
              <div className="border-t border-[var(--border)] bg-[var(--card)] p-4">{footer}</div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
