"use client";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
// luxon3 plugin teaches FullCalendar how to resolve IANA tz names (e.g.
// "Asia/Hong_Kong"). Without it, `timeZone` only honors "local" / "UTC" and
// silently renders named zones at UTC offsets — see CLAUDE.md Timezones.
import luxonPlugin from "@fullcalendar/luxon3";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import type { AppointmentStatus, Availability, CalendarAppointment } from "@/types/api";
import { APP_TIMEZONE } from "@/lib/format";

// The calendar collapses the 7-state §11 lifecycle into 3 visual buckets so
// the grid reads at a glance. Modals still render the precise status via
// StatusBadge for full fidelity.
//   upcoming = scheduled / consent_pending / data_collection (HW prepping)
//   live     = in_progress / awaiting_notes (meeting + write-up window)
//   done     = completed
//   cancelled is rendered muted/strikethrough rather than as a fourth color.
type StatusBucket = "upcoming" | "live" | "done" | "cancelled";

const STATUS_BUCKET: Record<AppointmentStatus, StatusBucket> = {
  scheduled:       "upcoming",
  consent_pending: "upcoming",
  data_collection: "upcoming",
  in_progress:     "live",
  awaiting_notes:  "live",
  completed:       "done",
  cancelled:       "cancelled",
};

const BUCKET_COLORS: Record<StatusBucket, { bg: string; border: string; text: string }> = {
  upcoming:  { bg: "#f1f5f9", border: "#cbd5e1", text: "#334155" },
  live:      { bg: "#dbeafe", border: "#0052ff", text: "#0052ff" },
  done:      { bg: "#d1fae5", border: "#6ee7b7", text: "#065f46" },
  cancelled: { bg: "#f8fafc", border: "#e2e8f0", text: "#94a3b8" },
};

export function AppointmentCalendar({
  appointments,
  availability,
  basePath = "/healthworker/appointments",
}: {
  appointments: CalendarAppointment[];
  availability?: Availability[];
  basePath?: string;
}) {
  const router = useRouter();

  const events = useMemo(() => {
    const apptEvents = appointments.map((a) => {
      const bucket = STATUS_BUCKET[a.status];
      const c = BUCKET_COLORS[bucket];
      return {
        id: String(a.id),
        title: `${a.patientName} · ${a.doctorName}`,
        start: a.scheduledAt,
        // Display block ensures the title shows in week view; allDay is false so
        // the event lands on its time slot.
        allDay: false,
        backgroundColor: c.bg,
        borderColor: c.border,
        textColor: c.text,
        // Bucket-named class drives the pulse on live and the strikethrough on
        // cancelled; see FC_CSS below.
        classNames: [`fc-bucket-${bucket}`],
        extendedProps: { status: a.status, kind: "appointment" },
      };
    });
    // Availability bands sit *behind* appointments (display:'background'),
    // tinted soft green to read as "doctor is reachable here." Booking is
    // not gated on these — the band is a hint, not a constraint.
    const availEvents = (availability ?? []).map((w) => ({
      id: `availability:${w.id}`,
      start: w.startAt,
      end: w.endAt,
      allDay: false,
      display: "background" as const,
      backgroundColor: "rgba(16, 185, 129, 0.12)",
      extendedProps: { kind: "availability" },
    }));
    return [...availEvents, ...apptEvents];
  }, [appointments, availability]);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-md fc-haputele">
      <style>{FC_CSS}</style>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin, luxonPlugin]}
        timeZone={APP_TIMEZONE}
        initialView="timeGridWeek"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "timeGridDay,timeGridWeek,dayGridMonth,listWeek",
        }}
        buttonText={{
          timeGridDay: "day",
          listWeek: "agenda",
        }}
        height="calc(100vh - 180px)"
        events={events}
        // Appointments carry only `scheduledAt`, no end time. Render each as
        // a 15-minute block to match the slot grid (default would be 1h).
        defaultTimedEventDuration="00:15:00"
        nowIndicator
        // Visible day window: 07:00–20:00. Slot picker + availability grid
        // also constrain to this range so booking and declaration are
        // consistent. All-day strip hidden — appointments always have a time.
        slotDuration="00:15:00"
        slotLabelInterval="01:00:00"
        slotMinTime="07:00:00"
        slotMaxTime="20:00:00"
        scrollTime="07:00:00"
        allDaySlot={false}
        eventClick={(info) => {
          // Background availability bands are advisory, not navigable.
          if (info.event.extendedProps.kind === "availability") return;
          router.push(`${basePath}/${info.event.id}`);
        }}
        eventDisplay="block"
      />
    </div>
  );
}

// FullCalendar ships its own CSS via JS, but typography + button chrome need
// nudging to match the design tokens (rounded buttons, mono labels, accent on hover).
const FC_CSS = `
  .fc-haputele .fc { font-family: var(--font-inter), system-ui, sans-serif; }
  .fc-haputele .fc-toolbar-title { font-family: var(--font-calistoga), Georgia, serif; font-weight: 400; letter-spacing: -0.01em; font-size: 1.25rem; }
  .fc-haputele .fc-col-header-cell-cushion,
  .fc-haputele .fc-timegrid-axis-cushion,
  .fc-haputele .fc-list-day-text {
    font-family: var(--font-jetbrains), monospace;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted-foreground);
  }
  .fc-haputele .fc-timegrid-slot-label-cushion { font-size: 0.8rem; }
  /* Taller rows so 15-min blocks have room to breathe and the event title
     stays on a single line at the larger font size. */
  .fc-haputele .fc-timegrid-slot { height: 2.6em !important; }
  .fc-haputele .fc-button {
    background: transparent !important;
    border: 1px solid var(--border) !important;
    color: var(--foreground) !important;
    text-transform: capitalize;
    font-weight: 500;
    border-radius: 0.625rem !important;
    padding: 0.4rem 0.75rem !important;
    box-shadow: none !important;
    transition: all 0.15s ease;
  }
  .fc-haputele .fc-button:hover {
    border-color: rgba(0, 82, 255, 0.3) !important;
    background: var(--muted) !important;
  }
  .fc-haputele .fc-button-active,
  .fc-haputele .fc-button-primary:not(:disabled).fc-button-active {
    background: var(--accent) !important;
    border-color: var(--accent) !important;
    color: white !important;
  }
  .fc-haputele .fc-button-group { gap: 0.25rem; }
  .fc-haputele .fc-event { border-radius: 0.5rem !important; padding: 4px 6px; font-size: 0.875rem; line-height: 1.25; cursor: pointer; }
  .fc-haputele .fc-event .fc-event-time { font-weight: 600; }
  .fc-haputele .fc-event:hover { filter: brightness(0.97); }
  .fc-haputele .fc-bucket-live { box-shadow: 0 0 0 2px rgba(0, 82, 255, 0.18); animation: fc-haputele-pulse 1.8s ease-in-out infinite; }
  .fc-haputele .fc-bucket-cancelled { opacity: 0.6; }
  .fc-haputele .fc-bucket-cancelled .fc-event-title,
  .fc-haputele .fc-bucket-cancelled .fc-event-time { text-decoration: line-through; }
  @keyframes fc-haputele-pulse {
    0%, 100% { box-shadow: 0 0 0 2px rgba(0, 82, 255, 0.18); }
    50%      { box-shadow: 0 0 0 4px rgba(0, 82, 255, 0.28); }
  }
  .fc-haputele .fc-timegrid-now-indicator-line { border-color: var(--accent); }
  .fc-haputele .fc-timegrid-now-indicator-arrow { border-color: var(--accent); }
  .fc-haputele .fc-day-today { background: rgba(0, 82, 255, 0.03) !important; }
`;
