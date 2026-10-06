"""Message thread router (ticket #26): parent/teacher direct threads."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.db.models import Message, MessageThread, School, User, UserRole, utcnow
from app.db.scoping import can_user_read_school
from app.db.session import get_db
from app.pagination import PageParams
from app.schemas.message import (
    MessageCreate,
    MessageListResponse,
    MessageOut,
    MessageThreadCreate,
    MessageThreadListResponse,
    MessageThreadOut,
    ThreadParticipant,
)

router = APIRouter()

_MODERATOR_ROLES = {UserRole.ADMIN, UserRole.PRINCIPAL}


def _participants(thread: MessageThread) -> list[int]:
    return list(thread.participant_ids or [])


def _is_participant(thread: MessageThread, user: User) -> bool:
    return user.id in _participants(thread)


def _same_school(user: User, thread: MessageThread) -> bool:
    if user.role == UserRole.SUPER_ADMIN:
        return True
    if user.tenant_id != thread.tenant_id:
        return False
    if user.school_id is not None and thread.school_id is not None:
        return user.school_id == thread.school_id
    return user.school_id is None


def _can_moderate(thread: MessageThread, user: User) -> bool:
    return user.role in _MODERATOR_ROLES and _same_school(user, thread)


def _can_read_thread(thread: MessageThread, user: User) -> bool:
    return _is_participant(thread, user) or _can_moderate(thread, user)


def _last_message(db: Session, thread_id: int) -> Message | None:
    return db.scalars(
        select(Message)
        .where(Message.thread_id == thread_id)
        .order_by(Message.sent_at.desc(), Message.id.desc())
        .limit(1)
    ).first()


def _thread_out(db: Session, thread: MessageThread) -> MessageThreadOut:
    out = MessageThreadOut.model_validate(thread)
    out.participant_ids = _participants(thread)
    last = _last_message(db, thread.id)
    out.last_message = MessageOut.model_validate(last) if last is not None else None
    return out


def _load_thread(db: Session, thread_id: int) -> MessageThread:
    thread = db.get(MessageThread, thread_id)
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="thread not found")
    return thread


@router.post("", status_code=status.HTTP_201_CREATED, response_model=MessageThreadOut)
def create_thread(
    payload: MessageThreadCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageThreadOut:
    """Create a thread with the caller as the first participant."""
    participant_ids: list[int] = [user.id]
    for uid in payload.participant_ids:
        if uid not in participant_ids:
            participant_ids.append(uid)

    for uid in participant_ids:
        member = db.get(User, uid)
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"participant {uid} not found",
            )
        if member.tenant_id != user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="cannot add a participant from another tenant",
            )
        if (
            user.role != UserRole.SUPER_ADMIN
            and member.school_id is not None
            and user.school_id is not None
            and member.school_id != user.school_id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="cannot add a participant from another school",
            )

    school_id = payload.school_id if payload.school_id is not None else user.school_id
    if school_id is not None:
        school = db.get(School, school_id)
        if school is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="school_id does not exist",
            )
        if user.role != UserRole.SUPER_ADMIN and (
            school.tenant_id != user.tenant_id
            or not can_user_read_school(db, user, school_id)
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="cannot target another tenant's school",
            )

    thread = MessageThread(
        tenant_id=user.tenant_id,
        school_id=school_id,
        participant_ids=participant_ids,
        subject=payload.subject,
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return _thread_out(db, thread)


@router.get("", response_model=MessageThreadListResponse)
def list_threads(
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageThreadListResponse:
    """List threads the caller participates in (moderators: own school)."""
    # scope: participant
    stmt = select(MessageThread)
    if user.role != UserRole.SUPER_ADMIN:
        stmt = stmt.where(MessageThread.tenant_id == user.tenant_id)
    rows = db.scalars(stmt.order_by(MessageThread.id.desc())).all()
    visible = [row for row in rows if _can_read_thread(row, user)]
    total = len(visible)
    window = visible[page.offset : page.offset + page.size]
    return MessageThreadListResponse(
        items=[_thread_out(db, row) for row in window],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.get("/{thread_id}", response_model=MessageThreadOut)
def get_thread(
    thread_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageThreadOut:
    """Read one thread (participant or same-school moderator)."""
    # scope: participant
    thread = _load_thread(db, thread_id)
    if not _can_read_thread(thread, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return _thread_out(db, thread)


@router.get("/{thread_id}/messages", response_model=MessageListResponse)
def list_messages(
    thread_id: int,
    page: PageParams = Depends(PageParams),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageListResponse:
    """List messages chronologically; caller must be a participant in the thread's school."""
    # scope: participant
    thread = _load_thread(db, thread_id)
    if not _is_participant(thread, user) or not _same_school(user, thread):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    unread = db.scalars(
        select(Message).where(
            Message.thread_id == thread_id,
            Message.sender_id != user.id,
            Message.read_at.is_(None),
        )
    ).all()
    if unread:
        now = utcnow()
        for message in unread:
            message.read_at = now
        db.commit()

    total = (
        db.scalar(
            select(func.count()).select_from(Message).where(Message.thread_id == thread_id)
        )
        or 0
    )
    rows = db.scalars(
        select(Message)
        .where(Message.thread_id == thread_id)
        .order_by(Message.sent_at, Message.id)
        .offset(page.offset)
        .limit(page.size)
    ).all()
    return MessageListResponse(
        items=[MessageOut.model_validate(row) for row in rows],
        total=total,
        page=page.page,
        size=page.size,
    )


@router.post(
    "/{thread_id}/messages", status_code=status.HTTP_201_CREATED, response_model=MessageOut
)
def create_message(
    thread_id: int,
    payload: MessageCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    """Append a reply; caller must be a participant."""
    thread = _load_thread(db, thread_id)
    if not _is_participant(thread, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    message = Message(thread_id=thread.id, sender_id=user.id, body=payload.body)
    db.add(message)
    db.commit()
    db.refresh(message)
    return MessageOut.model_validate(message)


@router.post(
    "/{thread_id}/participants",
    status_code=status.HTTP_201_CREATED,
    response_model=MessageThreadOut,
)
def add_participant(
    thread_id: int,
    payload: ThreadParticipant,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageThreadOut:
    """Add a participant; caller must already be a participant."""
    thread = _load_thread(db, thread_id)
    if not _is_participant(thread, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    member = db.get(User, payload.user_id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="user not found"
        )
    if member.tenant_id != thread.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="cannot add a participant from another tenant",
        )

    participants = _participants(thread)
    if payload.user_id not in participants:
        thread.participant_ids = participants + [payload.user_id]
        db.commit()
        db.refresh(thread)
    return _thread_out(db, thread)


@router.delete("/{thread_id}/participants/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_participant(
    thread_id: int,
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Remove a participant; caller must be a participant."""
    thread = _load_thread(db, thread_id)
    if not _is_participant(thread, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    participants = _participants(thread)
    if user_id not in participants:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="participant not found")
    thread.participant_ids = [p for p in participants if p != user_id]
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
