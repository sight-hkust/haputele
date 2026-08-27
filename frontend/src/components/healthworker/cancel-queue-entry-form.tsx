"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Textarea } from "@/components/primitives/select";
import { useCancelQueueEntry } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const cancel = useCancelQueueEntry(entry.id);
  return (
    <div className="flex flex-col gap-3">
      <Textarea
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("queue.cancelReasonPlaceholder")}
      />
      {cancel.error && (
        <ErrorBanner>{explainError(cancel.error.error, cancel.error.message)}</ErrorBanner>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={cancel.isPending}>
          {t("common.back")}
        </Button>
        <Button
          variant="destructive"
          onClick={() =>
            cancel.mutate({ reason: reason.trim() || undefined }, { onSuccess: onCancelled })
          }
          disabled={cancel.isPending}
        >
          {cancel.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
          {t("pages.healthworker.appointments.cancelEntry")}
        </Button>
      </div>
    </div>
  );
}
