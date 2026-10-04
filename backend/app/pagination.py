"""Shared list pagination dependency (default 20, max 100 per page)."""

from __future__ import annotations

from fastapi import Query


class PageParams:
    """Query-param dependency exposing validated ``page``/``size``/``offset``."""

    def __init__(
        self,
        page: int = Query(1, ge=1, description="1-indexed page number"),
        size: int = Query(20, ge=1, le=100, description="Rows per page (max 100)"),
    ) -> None:
        self.page = page
        self.size = size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size
