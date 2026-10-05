"""Message thread schemas (ticket #26)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class MessageThreadCreate(BaseModel):
    """Create a thread; the caller is always added as a participant."""

    participant_ids: list[int] = Field(default_factory=list)
    subject: str = Field(min_length=1, max_length=255)
    school_id: int | None = None


class MessageThreadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    school_id: int | None = None
    participant_ids: list[int] = []
    subject: str
    created_at: datetime
    last_message: "MessageOut | None" = None


class MessageCreate(BaseModel):
    """Reply body for a thread."""

    body: str = Field(min_length=1)


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    thread_id: int
    sender_id: int
    body: str
    sent_at: datetime
    read_at: datetime | None = None


class ThreadParticipant(BaseModel):
    """A participant reference on a thread."""

    user_id: int


class ThreadParticipantOut(BaseModel):
    user_id: int
    full_name: str | None = None
    role: str | None = None


class MessageListResponse(BaseModel):
    items: list[MessageOut]
    total: int
    page: int
    size: int


class MessageThreadListResponse(BaseModel):
    items: list[MessageThreadOut]
    total: int
    page: int
    size: int


MessageThreadOut.model_rebuild()
