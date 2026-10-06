"""Canonical academic-period contract (ticket #44).

Semester canonical form: ``YYYY/YYYY-ganjil`` or ``YYYY/YYYY-genap``
(e.g. ``"2026/2027-ganjil"``). This module is the single source of truth for
both the regex and the Pydantic field type used by request schemas.
"""

from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator

SEMESTER_PATTERN = re.compile(r"^(\d{4})/(\d{4})-(ganjil|genap)$")
TERMS = ("ganjil", "genap")

#: The semester considered "current" until a tenant_settings table exists.
ACTIVE_SEMESTER = "2026/2027-ganjil"


def parse_semester(s: str) -> tuple[int, str]:
    """Parse ``'2026/2027-ganjil'`` → ``(2026, 'ganjil')``."""
    m = SEMESTER_PATTERN.match(s)
    if not m:
        raise ValueError(f"invalid semester format: {s!r}; expected 'YYYY/YYYY-ganjil|genap'")
    return int(m.group(1)), m.group(3)


def make_semester(year: int, term: str) -> str:
    """Build a canonical semester string from a start year and term."""
    if term not in TERMS:
        raise ValueError(f"invalid term: {term!r}")
    return f"{year}/{year + 1}-{term}"


def validate_semester(value: str) -> str:
    """Pydantic-compatible validator: reject non-canonical semester strings."""
    if not SEMESTER_PATTERN.match(value):
        raise ValueError("semester must match 'YYYY/YYYY-ganjil|genap'")
    return value


SemesterStr = Annotated[str, AfterValidator(validate_semester)]
