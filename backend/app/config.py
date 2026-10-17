"""Runtime configuration values read from the environment.

Kept deliberately tiny: the only domain knob currently needed is the
attendance correction window (ticket #50). Reading the value at import time
keeps it overridable in tests via ``app.config.EDIT_WINDOW_HOURS``.
"""

from __future__ import annotations

import os
from datetime import date

# How long after a record is written a same-day correction is still allowed.
EDIT_WINDOW_HOURS: int = int(os.getenv("ATTENDANCE_EDIT_WINDOW_HOURS", "24"))


def _parse_deadline(raw: str | None) -> date | None:
    """Parse an ISO grade-entry deadline; an empty value disables the gate."""
    if not raw:
        return None
    return date.fromisoformat(raw)


# Grade-entry deadline for rapor finalization/compilation. Overridable via env.
GRADE_ENTRY_DEADLINE: date | None = _parse_deadline(
    os.getenv("GRADE_ENTRY_DEADLINE", "2026-07-31")
)
