"""Notification schemas (ticket #51)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationOut(BaseModel):
    """A single in-app notification addressed to the current user."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    type: str
    title: str
    body: str
    link: str | None = None
    is_read: bool
    created_at: datetime
    read_at: datetime | None = None
