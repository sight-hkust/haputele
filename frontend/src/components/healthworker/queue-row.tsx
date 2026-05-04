"use client";

import Link from "next/link";
import {
  AlertOctagon,
  CalendarPlus,
  Clock,
  Stethoscope,
  UserPlus,
  X,
} from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { usePatient } from "@/lib/use-api";
import { fmtRelative, fmtTargetWeek, fullName } from "@/lib/format";
import type { QueueEntry, QueueSource } from "@/types/api";

export const QUEUE_SOURCE_META: Record<
  QueueSource,
  { label: string; Icon: typeof Stethoscope; tone: string }
> = {
  walk_in: { label: "Walk-in", Icon: UserPlus, tone: "text-sky-700 bg-sky-50 border-sky-200" },
  screening: { label: "Screening", Icon: AlertOctagon, tone: "text-amber-800 bg-amber-50 border-amber-200" },
  follow_up: { label: "Follow-up", Icon: Stethoscope, tone: "text-violet-700 bg-violet-50 border-violet-200" },
};

export function QueueRow({
  entry,
  onBook,
  onCancel,
  compact = false,
}: {
  entry: QueueEntry;
  onBook: () => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const patient = usePatient(entry.patientId);
  const meta = QUEUE_SOURCE_META[entry.source];
  const Icon = meta.Icon;
  const isPending = entry.status === "pending";

  return (
    <li>
      <Card className={compact ? "p-3" : "p-4"}>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${meta.tone}`}
          >
            <Icon className="h-3 w-3" />
            {meta.label}
          </div>
          {entry.priority === "urgent" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-rose-700">
              <AlertOctagon className="h-3 w-3" />
              Urgent
            </span>
          )}
          {!compact && (
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] " +
                (entry.status === "pending"
                  ? "border border-amber-200 bg-amber-50 text-amber-800"
                  : entry.status === "booked"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-[var(--border)] bg-[var(--muted)]/50 text-[var(--muted-foreground)]")
              }
            >
              {entry.status}
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            #{entry.id} · {fmtRelative(entry.createdAt)}
          </span>
        </div>

        <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${compact ? "mt-2" : "mt-3"}`}>
          <Link
            href={`/healthworker/patients/${entry.patientId}`}
            className={`font-semibold tracking-[-0.01em] hover:text-[var(--accent)] hover:underline ${compact ? "text-sm" : "text-base"}`}
          >
            {patient.data?.patient ? fullName(patient.data.patient) : `Patient #${entry.patientId}`}
          </Link>
          {entry.targetDate && (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
              <Clock className="h-3 w-3" />
              {fmtTargetWeek(entry.targetDate)}
            </span>
          )}
        </div>

        {entry.notes && (
          <p className={`text-sm text-[var(--muted-foreground)] ${compact ? "mt-1.5 line-clamp-2 text-xs" : "mt-2"}`}>
            {entry.notes}
          </p>
        )}

        {entry.cancellationReason && !compact && (
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Cancelled: {entry.cancellationReason}
          </p>
        )}

        {isPending && (
          <div className={`flex justify-end gap-2 ${compact ? "mt-2" : "mt-3"}`}>
            <Button variant="secondary" size="sm" onClick={onCancel}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button size="sm" onClick={onBook}>
              <CalendarPlus className="h-4 w-4" />
              Book
            </Button>
          </div>
        )}
      </Card>
    </li>
  );
}
