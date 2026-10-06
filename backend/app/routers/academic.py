"""Academic-period router (ticket #44): exposes the active semester."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.academic import ACTIVE_SEMESTER
from app.db.session import get_db

router = APIRouter()


@router.get("/active-semester")
def get_active_semester(db: Session = Depends(get_db)) -> dict[str, str]:
    """Return the currently-active semester (hardcoded until tenant config lands).

    Shape: ``{"semester": "2026/2027-ganjil", "academic_year": "2026/2027",
    "term": "ganjil"}``.
    """
    year, term = ACTIVE_SEMESTER.split("-", 1)
    # scope: public
    return {"semester": ACTIVE_SEMESTER, "academic_year": year, "term": term}
