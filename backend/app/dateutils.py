from datetime import date, datetime, timedelta, timezone
from typing import Optional


# One slot width. The picker offers 15-min slots, and a slot stays bookable
# while you are still inside it — a health worker who wants to start the
# consultation right now should not be blocked by the clock having just
# crossed the slot's start. So "in the past" means the whole slot has
# elapsed, not merely that it started. Mirrored on the frontend as SLOT_MS
# in `components/doctor/doctor-slot-picker.tsx`.
#
# The grace window doubles as slack for browser/server clock skew: the
# client filters against its own clock, the server against its own, and
# there is no server-time endpoint to reconcile them (see issue #81).
BOOKING_GRACE = timedelta(minutes=15)


def is_past_slot(scheduled_at: datetime, now: Optional[datetime] = None) -> bool:
    """True when `scheduled_at`'s whole slot has already elapsed.

    `scheduled_at` must be timezone-aware — every appointment schema that
    reaches this runs `_require_aware` first, so a naive value is a bug in
    the caller rather than something to paper over here.
    """
    return scheduled_at <= (now or datetime.now(timezone.utc)) - BOOKING_GRACE


def snap_to_monday(d: Optional[date]) -> Optional[date]:
    """Normalise any chosen date to the Monday of its ISO week.

    The queue's `target_date` is semantically "the week the patient should be
    seen by", not a hard calendar appointment slot — we store the Monday of
    that week to make the fuzziness explicit and to keep ordering stable.
    Hard deadlines belong in `priority='urgent'` + the notes field, not here.
    """
    if d is None:
        return None
    return d - timedelta(days=d.weekday())  # Mon=0
