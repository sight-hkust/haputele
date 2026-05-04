from datetime import date, timedelta
from typing import Optional


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
