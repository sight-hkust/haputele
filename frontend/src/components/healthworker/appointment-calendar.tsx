"use client";

import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import FullCalendar, { CalendarController } from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import themePlugin from "@fullcalendar/react/themes/classic";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { AppointmentStatus, Availability, CalendarAppointment } from "@/types/api";
import { APP_TIMEZONE } from "@/lib/format";

// v7 resolves IANA tz names (e.g. "Asia/Hong_Kong") natively via Temporal
// (temporal-polyfill), so no timezone plugin is needed — see CLAUDE.md Timezones.
// The classic theme's palette is overridden below through --fc-classic-* vars.

// The calendar collapses the 7-state §11 lifecycle into 3 visual buckets so
// the grid reads at a glance. Modals still render the precise status via
// StatusBadge for full fidelity.
//   upcoming = scheduled / consent_pending / data_collection (HW prepping)
//   live     = in_progress / awaiting_notes (meeting + write-up window)
//   done     = completed
//   cancelled is rendered muted/strikethrough rather than as a fourth color.
type StatusBucket = "upcoming" | "live" | "done" | "cancelled";

const STATUS_BUCKET: Record<AppointmentStatus, StatusBucket> = {
  scheduled: "upcoming",
  consent_pending: "upcoming",
  data_collection: "upcoming",
  in_progress: "live",
  awaiting_notes: "live",
  completed: "done",
  cancelled: "cancelled",
};

const BUCKET_COLORS: Record<StatusBucket, { bg: string; text: string }> = {
  upcoming: { bg: "#f1f5f9", text: "#334155" },
  live: { bg: "#dbeafe", text: "#0052ff" },
  done: { bg: "#d1fae5", text: "#065f46" },
  cancelled: { bg: "#f8fafc", text: "#94a3b8" },
};

export function AppointmentCalendar({
  appointments,
  availability,
  basePath = "/healthworker/appointments",
  focusId,
  focusAt,
}: {
  appointments: CalendarAppointment[];
  availability?: Availability[];
  basePath?: string;
  /** Appointment to ring, so a list selection is findable in the grid. */
  focusId?: number | null;
  /** Its scheduledAt — the calendar jumps here when this changes. */
  focusAt?: string | null;
}) {
  const router = useRouter();
  // v7 replaced the ref/getApi handle with a controller instance passed as a
  // prop. One per mount; the calendar attaches its api to it on mount.
  const [controller] = useState(() => new CalendarController());

  // Jump to the focused appointment's date, keeping whatever view the user
  // is in — moving the date is the ask, changing the view as well would be
  // disorienting. `focusAt` rather than `focusId` so re-selecting the same
  // row after paging away still brings the grid back.
  useEffect(() => {
    if (focusAt) controller.gotoDate(focusAt);
  }, [controller, focusAt]);

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
        color: c.bg,
        contrastColor: c.text,
        // Bucket-named class drives the pulse on live and the strikethrough on
        // cancelled; see FC_CSS below.
        className: `fc-bucket-${bucket}`,
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
      // v7 paints background events from their own color — the theme's
      // background-event var is not consulted when a color is absent.
      color: "#10b981",
      extendedProps: { kind: "availability" },
    }));
    return [...availEvents, ...apptEvents];
  }, [appointments, availability]);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-md fc-haputele">
      <style>{FC_CSS}</style>
      <FullCalendar
        controller={controller}
        plugins={[themePlugin, dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
        timeZone={APP_TIMEZONE}
        initialView="timeGridWeek"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "timeGridDay,timeGridWeek,dayGridMonth,listWeek",
        }}
        buttons={{
          timeGridDay: { text: "day" },
          listWeek: { text: "agenda" },
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
        slotHeaderInterval="01:00:00"
        slotMinTime="07:00:00"
        slotMaxTime="20:00:00"
        scrollTime="07:00:00"
        allDaySlot={false}
        // Keep 15-min blocks at readable height (2.6em ≈ 42px) — without a
        // floor, v7 packs the 52 slots into the container height.
        slotMinHeight={42}
        // Styling hooks — the themed hooks carry our classes into the DOM so
        // FC_CSS never has to target FullCalendar's internal class names.
        toolbarTitleClass="fc-haputele-title"
        buttonClass={(info) =>
          info.isSelected ? "fc-haputele-button fc-haputele-button-active" : "fc-haputele-button"
        }
        eventClass={(info) =>
          focusId != null && info.event.id === String(focusId) ? "fc-haputele-focus" : ""
        }
        dayHeaderClass="fc-haputele-day-header"
        listDayHeaderClass="fc-haputele-day-header"
        slotHeaderClass="fc-haputele-slot-header"
        eventContent={(info) => (
          <div
            className={
              info.view.type === "listWeek"
                ? "fc-haputele-event fc-haputele-event-list"
                : "fc-haputele-event"
            }
          >
            {info.timeText && <span className="fc-haputele-event-time">{info.timeText}</span>}
            <span className="fc-haputele-event-title">{info.event.title}</span>
          </div>
        )}
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

// v7's own stylesheet is hashed utility classes, so all customization goes
// through the classic theme's CSS variables (scoped to our wrapper) plus the
// class hooks wired up in the component above.
const FC_CSS = `
  .fc-haputele {
    --fc-classic-background: var(--card);
    --fc-classic-border: var(--border);
    --fc-classic-strong-border: #cbd5e1;
    --fc-classic-foreground: var(--foreground);
    --fc-classic-muted: rgba(15, 23, 42, 0.05);
    --fc-classic-faint: rgba(15, 23, 42, 0.04);
    --fc-classic-muted-foreground: var(--muted-foreground);
    --fc-classic-primary: var(--accent);
    --fc-classic-now: var(--accent);
    --fc-classic-today: rgba(0, 82, 255, 0.03);
  }

  .fc-haputele .fc-haputele-title {
    font-family: var(--font-calistoga), Georgia, serif;
    font-weight: 400;
    letter-spacing: -0.01em;
    font-size: 1.25rem;
  }

  .fc-haputele .fc-haputele-day-header,
  .fc-haputele .fc-haputele-slot-header {
    font-family: var(--font-jetbrains), monospace;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--muted-foreground);
  }

  .fc-haputele .fc-haputele-button {
    background: transparent !important;
    border: 1px solid var(--border) !important;
    color: var(--foreground) !important;
    text-transform: capitalize;
    font-weight: 500;
    border-radius: 0.625rem !important;
    padding: 0.4rem 0.75rem !important;
    transition: all 0.15s ease;
  }
  .fc-haputele .fc-haputele-button:hover {
    border-color: rgba(0, 82, 255, 0.3) !important;
    background: var(--muted) !important;
  }
  .fc-haputele .fc-haputele-button-active,
  .fc-haputele .fc-haputele-button-active:hover {
    background: var(--accent) !important;
    border-color: var(--accent) !important;
    color: white !important;
  }

  .fc-haputele .fc-bucket-upcoming,
  .fc-haputele .fc-bucket-live,
  .fc-haputele .fc-bucket-done,
  .fc-haputele .fc-bucket-cancelled {
    border-radius: 0.5rem !important;
    padding: 4px 6px;
    cursor: pointer;
  }
  .fc-haputele .fc-bucket-upcoming { border-color: #cbd5e1; }
  .fc-haputele .fc-bucket-live {
    box-shadow: 0 0 0 2px rgba(0, 82, 255, 0.18);
    animation: fc-haputele-pulse 1.8s ease-in-out infinite;
  }
  .fc-haputele .fc-bucket-cancelled { opacity: 0.6; }

  /* Selected from the appointments list. Outline rather than a fill change so
     the status bucket's own colour still reads. Wins over .fc-bucket-live's
     pulse by sitting later in the sheet. */
  .fc-haputele .fc-haputele-focus {
    box-shadow: 0 0 0 3px var(--accent), 0 4px 12px rgba(0, 82, 255, 0.3) !important;
    animation: none !important;
    z-index: 2;
  }

  .fc-haputele-event {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    font-size: 0.875rem;
    line-height: 1.25;
  }
  .fc-haputele-event-list {
    flex-direction: row;
    align-items: baseline;
    gap: 6px;
  }
  .fc-haputele-event-time { font-weight: 600; }
  .fc-haputele-event-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fc-haputele .fc-bucket-cancelled .fc-haputele-event-time,
  .fc-haputele .fc-bucket-cancelled .fc-haputele-event-title {
    text-decoration: line-through;
  }

  @keyframes fc-haputele-pulse {
    0%, 100% { box-shadow: 0 0 0 2px rgba(0, 82, 255, 0.18); }
    50%      { box-shadow: 0 0 0 4px rgba(0, 82, 255, 0.28); }
  }
`;
