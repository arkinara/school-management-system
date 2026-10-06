"""Auth router: register, login, logout, me, change-password."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response, status
from passlib.hash import bcrypt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_audit_event
from app.auth.cleanup import cleanup_expired_tokens
from app.auth.deps import get_current_user, oauth2_scheme, require_role
from app.auth.jwt import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
)
from app.db.models import School, TokenDenylist, User, UserRole
from app.db.session import get_db
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    UserLogin,
    UserMe,
    UserRegister,
)
from app.schemas.user import UserOut

router = APIRouter()

# Only non-privileged roles can self-register. Privileged accounts
# (principal, teacher, admin) are created by authorised admins via #48.
PUBLIC_REGISTER_ROLES: set[str] = {
    UserRole.STUDENT.value,
    UserRole.PARENT.value,
}

SCHOOL_REQUIRED_ROLES: set[str] = {
    UserRole.STUDENT.value,
    UserRole.PARENT.value,
}


def _hash_password(password: str) -> str:
    return bcrypt.hash(password)


def _authenticate(db: Session, email: str, password: str, tenant_id: int | None) -> User:
    stmt = select(User).where(User.email == email)
    if tenant_id is not None:
        stmt = stmt.where(User.tenant_id == tenant_id)
    user = db.scalar(stmt)
    if user is None or not bcrypt.verify(password, user.hashed_auth_ref):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    return user


def _token_for(user: User) -> str:
    return create_access_token(
        user.id,
        user.tenant_id,
        user.school_id,
        str(user.role),
    )


def _refresh_token_for(user: User) -> str:
    return create_refresh_token(user.id, str(uuid.uuid4()))


def _expires_at(exp: int) -> datetime:
    """Convert a JWT ``exp`` claim into the naive UTC datetime columns store."""
    return datetime.fromtimestamp(exp, tz=timezone.utc).replace(tzinfo=None)


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=AuthResponse)
def register(payload: UserRegister, db: Session = Depends(get_db)) -> AuthResponse:
    """Create a user scoped to a tenant/school and return a JWT."""
    role = payload.role
    if role not in PUBLIC_REGISTER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid role",
        )

    if role in SCHOOL_REQUIRED_ROLES and payload.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="school_id is required for public registration",
        )

    # Defense in depth: public roles always require an explicit school.
    if payload.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="school_id is required for public registration",
        )

    school = db.get(School, payload.school_id)
    if school is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="school not found",
        )
    tenant_id = school.tenant_id

    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email already registered",
        )

    user = User(
        tenant_id=tenant_id,
        school_id=payload.school_id,
        email=str(payload.email),
        hashed_auth_ref=_hash_password(payload.password),
        role=UserRole(role),
        full_name=payload.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return AuthResponse(
        user=UserOut.model_validate(user),
        access_token=_token_for(user),
        refresh_token=_refresh_token_for(user),
        token_type="bearer",
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)) -> AuthResponse:
    """Authenticate credentials and issue an access token.

    TODO: rate-limit login attempts (future ticket).
    """
    try:
        user = _authenticate(db, str(payload.email), payload.password, payload.tenant_id)
    except HTTPException:
        log_audit_event(
            db,
            action="login_failed",
            detail=f"email={payload.email}",
            tenant_id=payload.tenant_id,
            request=request,
        )
        raise
    log_audit_event(db, user=user, action="login", request=request)
    return AuthResponse(
        user=UserOut.model_validate(user),
        access_token=_token_for(user),
        refresh_token=_refresh_token_for(user),
        token_type="bearer",
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    user: User = Depends(get_current_user),
    token: str | None = Depends(oauth2_scheme),
    refresh_token: str | None = Body(default=None),
    db: Session = Depends(get_db),
) -> Response:
    """Revoke the caller's tokens until expiry and record an audit event.

    The access token is always revoked. When the client also supplies its
    refresh token, that token is revoked too, so a logged-out session cannot be
    silently revived via ``POST /auth/refresh``.
    """
    revoked: list[TokenDenylist] = []

    access_payload = decode_access_token(token) if token else None
    if access_payload and access_payload.get("jti") and access_payload.get("exp") is not None:
        revoked.append(
            TokenDenylist(
                jti=access_payload["jti"],
                user_id=user.id,
                expires_at=_expires_at(int(access_payload["exp"])),
            )
        )

    refresh_payload = decode_refresh_token(refresh_token) if refresh_token else None
    if refresh_payload and refresh_payload.get("jti") and refresh_payload.get("exp") is not None:
        revoked.append(
            TokenDenylist(
                jti=refresh_payload["jti"],
                user_id=user.id,
                expires_at=_expires_at(int(refresh_payload["exp"])),
            )
        )

    for entry in revoked:
        db.add(entry)
    if revoked:
        db.commit()

    log_audit_event(
        db,
        user=user,
        action="logout",
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/refresh", response_model=AuthResponse)
def refresh(
    refresh_token: str = Body(...),
    db: Session = Depends(get_db),
) -> AuthResponse:
    """Exchange a valid refresh token for a fresh access + refresh pair."""
    payload = decode_refresh_token(refresh_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid refresh token",
        )
    jti = payload.get("jti")
    if jti and db.scalar(select(TokenDenylist).where(TokenDenylist.jti == jti)) is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="refresh token revoked",
        )
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="user not found",
        )
    return AuthResponse(
        user=UserOut.model_validate(user),
        access_token=_token_for(user),
        refresh_token=_refresh_token_for(user),
        token_type="bearer",
    )


@router.post("/cleanup-tokens")
def cleanup_tokens(
    _admin: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    """Purge expired denylist rows (admin-only; call from a cron in prod)."""
    return {"deleted": cleanup_expired_tokens(db)}


@router.get("/me", response_model=UserMe)
def me(user: User = Depends(get_current_user)) -> UserMe:
    """Return the authenticated user's profile plus resolved JWT claims."""
    return UserMe(
        user=UserOut.model_validate(user),
        tenant_id=user.tenant_id,
        school_id=user.school_id,
        role=str(user.role),
    )


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Verify the current password and replace it with a bcrypt hash."""
    if not bcrypt.verify(payload.current_password, user.hashed_auth_ref):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="current password is incorrect",
        )
    user.hashed_auth_ref = _hash_password(payload.new_password)
    db.add(user)
    db.commit()
    return {"detail": "password updated"}
