"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Textarea } from "@/components/primitives/select";
import { useCancelQueueEntry } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import type { QueueEntry } from "@/types/api";

export function CancelQueueEntryForm({
  entry,
  onCancelled,
  onClose,
}: {
  entry: QueueEntry;
  onCancelled: () => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const cancel = useCancelQueueEntry(entry.id);
  return (
    <div className="flex flex-col gap-3">
      <Textarea
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional) — e.g. patient declined"
      />
      {cancel.error && <ErrorBanner>{explainError(cancel.error.error, cancel.error.message)}</ErrorBanner>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={cancel.isPending}>
          Back
        </Button>
        <Button
          variant="destructive"
          onClick={() =>
            cancel.mutate({ reason: reason.trim() || undefined }, { onSuccess: onCancelled })
          }
          disabled={cancel.isPending}
        >
          {cancel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          Cancel entry
        </Button>
      </div>
    </div>
  );
}
