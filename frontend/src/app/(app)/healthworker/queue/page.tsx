"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { ApiErrorBanner } from "@/components/primitives/error-banner";
import { Modal } from "@/components/primitives/modal";
import { PageHeader } from "@/components/primitives/page-header";
import { Select } from "@/components/primitives/select";
import { CancelQueueEntryForm } from "@/components/healthworker/cancel-queue-entry-form";
import { QueueEntryForm } from "@/components/healthworker/queue-entry-form";
import { QueueRow } from "@/components/healthworker/queue-row";
import { useI18n } from "@/lib/i18n";
import { useQueueList } from "@/lib/use-api";
import type { QueueEntry, QueuePriority, QueueSource, QueueStatus } from "@/types/api";

// Full-detail queue page — filters across status / source / priority + per-entry
// inspection. Booking is not done here; clicking "Book this" forwards to the
// appointments workspace with `?bookFromQueue=N`, where the booking card
// pre-fills and the row gets ring-highlighted (same UX as picking from the
// queue card inside the workspace itself).
export default function QueuePage() {
  const { t } = useI18n();
  const router = useRouter();
  const [status, setStatus] = useState<QueueStatus | "">("pending");
  const [source, setSource] = useState<QueueSource | "">("");
  const [priority, setPriority] = useState<QueuePriority | "">("");
  const [addOpen, setAddOpen] = useState(false);
  const [cancelEntry, setCancelEntry] = useState<QueueEntry | null>(null);

  const list = useQueueList({
    status: status || undefined,
    source: source || undefined,
    priority: priority || undefined,
  });

  const entries = list.data ?? [];

  const goBook = (entry: QueueEntry) => {
    router.push(`/healthworker/appointments?bookFromQueue=${entry.id}`);
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
      <PageHeader
        label={t("pages.healthworker.queuePage.label")}
        title={t("pages.healthworker.queuePage.title")}
        highlight={t("pages.healthworker.queuePage.highlight")}
        subtitle={t("pages.healthworker.queuePage.subtitle")}
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("pages.healthworker.appointments.addEntry")}
          </Button>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Filter label={t("common.status")}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as QueueStatus | "")}>
              <option value="">{t("common.all")}</option>
              <option value="pending">{t("queue.statusTitle.pending")}</option>
              <option value="booked">{t("queue.statusTitle.booked")}</option>
              <option value="cancelled">{t("queue.statusTitle.cancelled")}</option>
            </Select>
          </Filter>
          <Filter label={t("common.source")}>
            <Select value={source} onChange={(e) => setSource(e.target.value as QueueSource | "")}>
              <option value="">{t("common.all")}</option>
              <option value="walk_in">{t("queue.walkIn")}</option>
              <option value="screening">{t("queue.screening")}</option>
              <option value="follow_up">{t("queue.followUp")}</option>
            </Select>
          </Filter>
          <Filter label={t("common.priority")}>
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as QueuePriority | "")}
            >
              <option value="">{t("common.all")}</option>
              <option value="urgent">{t("queue.urgent")}</option>
              <option value="routine">{t("queue.routine")}</option>
            </Select>
          </Filter>
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
          {t("pages.healthworker.queuePage.sortHint")}
        </p>
      </div>

      {list.error ? (
        <ApiErrorBanner error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
          {t("common.loading")}
        </Card>
      ) : entries.length === 0 ? (
        <EmptyState
          Icon={Inbox}
          title={
            status === "pending"
              ? t("pages.healthworker.appointments.queueClearTitle")
              : t("pages.healthworker.queuePage.noEntriesMatch")
          }
          description={
            status === "pending"
              ? t("pages.healthworker.queuePage.currentlyWaiting")
              : t("pages.healthworker.queuePage.tryAdjustingFilters")
          }
          action={
            status === "pending" && (
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("pages.healthworker.appointments.addEntry")}
              </Button>
            )
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <QueueRow
              key={e.id}
              entry={e}
              onBook={() => goBook(e)}
              onCancel={() => setCancelEntry(e)}
            />
          ))}
        </ul>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t("pages.healthworker.appointments.addToQueue")}
        description={t("pages.healthworker.queuePage.addModalDescription")}
      >
        <QueueEntryForm
          onCreated={() => {
            setAddOpen(false);
            list.refetch();
          }}
          onCancel={() => setAddOpen(false)}
        />
      </Modal>

      <Modal
        open={!!cancelEntry}
        onClose={() => setCancelEntry(null)}
        title={t("pages.healthworker.appointments.cancelEntry")}
        description={t("pages.healthworker.queuePage.cancelModalDescription")}
      >
        {cancelEntry && (
          <CancelQueueEntryForm
            entry={cancelEntry}
            onCancelled={() => {
              setCancelEntry(null);
              list.refetch();
            }}
            onClose={() => setCancelEntry(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
        {label}
      </span>
      {children}
    </div>
  );
}
