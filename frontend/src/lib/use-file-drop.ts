"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";

// Drag-and-drop file handling for upload zones. Spread `dropProps` on the drop
// target and use `isDragging` to highlight it; dropped files are handed to
// `onFiles`. Single-file targets get just the first file (multiple: false,
// the default); multi-file targets get them all. Pointer/keyboard upload paths
// are untouched — this only adds drag-and-drop on top.
export function useFileDrop(
  onFiles: (files: File[]) => void,
  opts?: { multiple?: boolean; disabled?: boolean },
) {
  const multiple = opts?.multiple ?? false;
  const disabled = opts?.disabled ?? false;
  const [isDragging, setIsDragging] = useState(false);
  // dragenter/dragleave fire for every child element the cursor crosses; a
  // depth counter keeps the highlight steady until the pointer truly leaves.
  const depth = useRef(0);

  const hasFiles = (e: DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const onDragEnter = useCallback(
    (e: DragEvent) => {
      if (disabled || !hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setIsDragging(true);
    },
    [disabled],
  );

  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (disabled || !hasFiles(e)) return;
      // Required so the element is recognised as a valid drop target.
      e.preventDefault();
    },
    [disabled],
  );

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      depth.current = 0;
      setIsDragging(false);
      if (disabled) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      onFiles(multiple ? files : files.slice(0, 1));
    },
    [disabled, multiple, onFiles],
  );

  return {
    isDragging,
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
