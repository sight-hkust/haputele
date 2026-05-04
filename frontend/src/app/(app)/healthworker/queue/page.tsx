"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { Modal } from "@/components/primitives/modal";
import { PageHeader } from "@/components/primitives/page-header";
import { Select } from "@/components/primitives/select";
import { CancelQueueEntryForm } from "@/components/healthworker/cancel-queue-entry-form";
import { QueueEntryForm } from "@/components/healthworker/queue-entry-form";
import { QueueRow } from "@/components/healthworker/queue-row";
import { useQueueList } from "@/lib/use-api";
import { explainError } from "@/lib/error-codes";
import type { QueueEntry, QueuePriority, QueueSource, QueueStatus } from "@/types/api";

// Full-detail queue page — filters across status / source / priority + per-entry
// inspection. Booking is not done here; clicking "Book this" forwards to the
// appointments workspace with `?bookFromQueue=N`, where the booking card
// pre-fills and the row gets ring-highlighted (same UX as picking from the
// queue card inside the workspace itself).
export default function QueuePage() {
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
        label="Queue"
        title="Full"
        highlight="queue."
        subtitle="Filter, inspect, and audit. Booking happens in the appointments workspace — clicking 'Book' on any entry forwards there with the entry pre-loaded."
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add entry
          </Button>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Filter label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as QueueStatus | "")}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="booked">Booked</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Filter>
          <Filter label="Source">
            <Select value={source} onChange={(e) => setSource(e.target.value as QueueSource | "")}>
              <option value="">All</option>
              <option value="walk_in">Walk-in</option>
              <option value="screening">Screening</option>
              <option value="follow_up">Follow-up</option>
            </Select>
          </Filter>
          <Filter label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as QueuePriority | "")}>
              <option value="">All</option>
              <option value="urgent">Urgent</option>
              <option value="routine">Routine</option>
            </Select>
          </Filter>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
          Sort: urgent first → soonest target week → longest waiting
        </p>
      </div>

      {list.error ? (
        <ErrorBanner>{explainError(list.error.error, list.error.message)}</ErrorBanner>
      ) : list.isLoading ? (
        <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
          Loading…
        </Card>
      ) : entries.length === 0 ? (
        <EmptyState
          Icon={Inbox}
          title={status === "pending" ? "Queue is clear" : "No entries match"}
          description={
            status === "pending"
              ? "No one is currently waiting to be scheduled."
              : "Try adjusting the filters."
          }
          action={
            status === "pending" && (
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" />
                Add entry
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
        title="Add to queue"
        description="Walk-in or screening intake. Patient must already be registered."
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
        title="Cancel this entry?"
        description="Cancelling closes the entry permanently."
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
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
        {label}
      </span>
      {children}
    </div>
  );
}
