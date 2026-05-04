"use client";

import { useState } from "react";
import { PhoneOff, Video } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import { ApiError } from "@/lib/api";
import { explainError } from "@/lib/error-codes";
import { useMeetingToken } from "@/lib/use-api";
import type { AppointmentStatus } from "@/types/api";

import { MeetingRoom } from "./meeting-room";

type Props = {
  appointmentId: number;
  status: AppointmentStatus;
};

// Inline call panel rendered alongside the consultation form so the doctor
// can see the patient while filling out notes / prescription / review.
// Uses the same /meeting-token endpoint as the modal join — no state change.
export function DoctorCallPanel({ appointmentId, status }: Props) {
  const meetingToken = useMeetingToken(appointmentId);
  const [creds, setCreds] = useState<{ token: string; serverUrl: string } | null>(null);

  const canJoin = status === "in_progress";
  const callOver = ["awaiting_notes", "completed", "cancelled"].includes(status);

  const handleJoin = () =>
    meetingToken.mutate(undefined, {
      onSuccess: (res) => setCreds({ token: res.token, serverUrl: res.serverUrl }),
    });

  if (creds) {
    return (
      <Card className="flex h-full min-h-[480px] flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--muted)]/40 px-4 py-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
            Live with patient
          </span>
          <button
            type="button"
            onClick={() => setCreds(null)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:text-red-500"
          >
            <PhoneOff className="h-3.5 w-3.5" />
            Leave
          </button>
        </div>
        <div className="min-h-0 flex-1 bg-black">
          <MeetingRoom
            token={creds.token}
            serverUrl={creds.serverUrl}
            onLeave={() => setCreds(null)}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] p-2 shadow-accent">
          <Video className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold tracking-[-0.01em]">
            {callOver ? "Call ended" : canJoin ? "Live call available" : "Waiting on healthworker"}
          </h3>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {callOver
              ? "The healthworker has ended the meeting. Continue with notes."
              : canJoin
                ? "Join to see and speak with the patient while you take notes."
                : "The healthworker hasn't started the call yet."}
          </p>
          {meetingToken.error && (
            <ErrorBanner className="mt-2">
              {explainError((meetingToken.error as ApiError).error)}
            </ErrorBanner>
          )}
          {canJoin && (
            <div className="mt-3">
              <Button onClick={handleJoin} disabled={meetingToken.isPending}>
                <Video className="h-4 w-4" />
                {meetingToken.isPending ? "Connecting…" : "Join call"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
