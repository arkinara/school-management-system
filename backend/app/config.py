"""Runtime configuration values read from the environment.

Kept deliberately tiny: the only domain knob currently needed is the
attendance correction window (ticket #50). Reading the value at import time
keeps it overridable in tests via ``app.config.EDIT_WINDOW_HOURS``.
"""

from __future__ import annotations

import os

# How long after a record is written a same-day correction is still allowed.
EDIT_WINDOW_HOURS: int = int(os.getenv("ATTENDANCE_EDIT_WINDOW_HOURS", "24"))
