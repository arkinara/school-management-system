"""Auth router: register, login, logout, me, change-password."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from passlib.hash import bcrypt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_audit_event
from app.auth.deps import get_current_user
from app.auth.jwt import create_access_token
from app.db.models import AuditLog, School, Tenant, User, UserRole
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

PUBLIC_REGISTER_ROLES: set[str] = {
    UserRole.PRINCIPAL.value,
    UserRole.TEACHER.value,
    UserRole.STUDENT.value,
    UserRole.PARENT.value,
    UserRole.ADMIN.value,
}

SCHOOL_REQUIRED_ROLES: set[str] = {
    UserRole.TEACHER.value,
    UserRole.STUDENT.value,
    UserRole.PARENT.value,
    UserRole.ADMIN.value,
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
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="school_id is required for this role",
        )

    tenant_id: int | None = None
    if payload.school_id is not None:
        school = db.get(School, payload.school_id)
        if school is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="school not found",
            )
        tenant_id = school.tenant_id
    else:
        first_tenant = db.scalar(select(Tenant).order_by(Tenant.id))
        if first_tenant is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="no tenant available",
            )
        tenant_id = first_tenant.id

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
        token_type="bearer",
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Stateless JWT logout: no server session to invalidate, record audit event."""
    db.add(
        AuditLog(
            actor_id=user.id,
            actor_role=str(user.role),
            action="logout",
            tenant_id=user.tenant_id,
            school_id=user.school_id,
            reason=None,
            bypassed=False,
        )
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
