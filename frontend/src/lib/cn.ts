import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const mergeClasses = extendTailwindMerge({
  extend: {
    // Match the semantic text sizes in globals.css; they are not text colors.
    theme: { text: ["page-heading", "section-heading", "field-label", "clinical-value"] },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return mergeClasses(clsx(inputs));
}
