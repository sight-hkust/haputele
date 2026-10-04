"use client";

import { useState } from "react";
import { PhoneOff, Video } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { ErrorBanner } from "@/components/primitives/error-banner";
import type { ApiError } from "@/lib/api";
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
  const [collapsed, setCollapsed] = useState(false);

  const canJoin = status === "in_progress";
  const callOver = ["awaiting_notes", "completed", "cancelled"].includes(status);

  if (callOver) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-[var(--muted)]/40 px-4 py-3 text-sm text-[var(--muted-foreground)]">
        <PhoneOff className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {status === "cancelled"
            ? "Appointment cancelled. The call is no longer available."
            : status === "completed"
              ? "Call ended. Consultation signed."
              : "Call ended. Your next action: finish the consultation and sign."}
        </span>
      </div>
    );
  }
  if (creds) {
    return (
      <Card className="flex min-w-0 flex-col overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--muted)]/40 px-4 py-2">
          <span className="text-sm font-semibold">Live with patient</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setCollapsed((value) => !value)}
              aria-expanded={!collapsed}
              aria-controls={`call-video-${appointmentId}`}
            >
              {collapsed ? "Show video" : "Hide video"}
            </Button>
            <Button variant="ghost" onClick={() => setCreds(null)}>
              <PhoneOff className="h-4 w-4" />
              Leave call
            </Button>
          </div>
        </div>
        {collapsed && (
          <p className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
            Video hidden; the call, microphone and camera remain connected. Show video to access
            call controls.
          </p>
        )}
        <div
          id={`call-video-${appointmentId}`}
          hidden={collapsed}
          className="h-[360px] min-w-0 bg-black sm:h-[420px]"
        >
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
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[var(--accent)]/10 p-2">
          <Video className="h-5 w-5 text-[var(--accent)]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-[-0.01em]">
            {canJoin ? "Live call available" : "Healthworker preparing the visit"}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {canJoin
              ? "Join to speak with the patient while documenting. You can hide the video without leaving."
              : "The healthworker will start the call after confirming consent and saving vitals."}
          </p>
          {meetingToken.error && (
            <ErrorBanner className="mt-2">
              {explainError((meetingToken.error as ApiError).error)}
            </ErrorBanner>
          )}
          {canJoin && (
            <div className="mt-3">
              <Button
                onClick={() =>
                  meetingToken.mutate(undefined, {
                    onSuccess: (res) => {
                      setCreds({ token: res.token, serverUrl: res.serverUrl });
                      setCollapsed(false);
                    },
                  })
                }
                disabled={meetingToken.isPending}
              >
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
