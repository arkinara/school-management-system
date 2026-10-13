"""FastAPI auth dependencies: current user, role guard, tenant-scope guard."""

from __future__ import annotations

import logging
from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.audit import log_audit_event
from app.auth.jwt import (
    TokenError,
    TokenExpiredError,
    decode_access_token_strict,
)
from app.db.models import TokenDenylist, User, UserRole
from app.db.scoping import can_user_read_school
from app.db.session import get_db
from app.middleware.scope import enforce_tenant_scope

logger = logging.getLogger("app.auth.deps")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

# Rate-limit the auditing of malformed JWTs so a bad-token flood cannot itself
# become an audit-log DoS: only every Nth rejected token is persisted.
_JWT_AUDIT_EVERY = 10
_jwt_audit_counter = 0


def _audit_denied(db: Session, user: User, *, action: str, reason_code: str) -> None:
    """Best-effort audit of a role/scope denial; never masks the 403."""
    try:
        log_audit_event(
            db,
            actor=user,
            action=action,
            outcome="denied",
            reason_code=reason_code,
        )
    except Exception:  # noqa: BLE001 - audit is best-effort
        logger.exception("failed to audit denial action=%s user=%s", action, user.id)


def _audit_invalid_jwt(db: Session, request: Request, exc: Exception) -> None:
    """Audit rejected JWTs at a 1:_JWT_AUDIT_EVERY rate to bound log volume."""
    global _jwt_audit_counter
    _jwt_audit_counter += 1
    if _jwt_audit_counter % _JWT_AUDIT_EVERY != 0:
        return
    try:
        log_audit_event(
            db,
            actor=None,
            action="auth_jwt_invalid",
            outcome="denied",
            reason_code=type(exc).__name__,
            request=request,
        )
    except Exception:  # noqa: BLE001 - audit is best-effort
        logger.exception("failed to audit invalid jwt")


def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the authenticated :class:`User` or raise 401."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
        )
    try:
        payload = decode_access_token_strict(token)
    except TokenExpiredError as exc:
        _audit_invalid_jwt(db, request, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token expired",
        ) from exc
    except TokenError as exc:
        _audit_invalid_jwt(db, request, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
        ) from exc

    jti = payload.get("jti")
    if jti and db.scalar(select(TokenDenylist).where(TokenDenylist.jti == jti)) is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token revoked",
        )

    raw_id = payload.get("user_id", payload.get("sub"))
    if raw_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token: missing subject",
        )
    user = db.get(User, int(raw_id))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="user not found",
        )
    request.state.user = user
    request.state.tenant_id = user.tenant_id
    request.state.school_id = user.school_id
    request.state.role = user.role
    return user


def require_role(*allowed_roles: str | UserRole) -> Callable[..., User]:
    """Dependency factory enforcing membership in ``allowed_roles`` (else 403)."""
    allowed = {str(r) for r in allowed_roles}

    def _dependency(
        request: Request,
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if str(user.role) not in allowed:
            logger.warning(
                "role escalation blocked: user_id=%s role=%s allowed=%s",
                user.id,
                str(user.role),
                sorted(allowed),
            )
            _audit_denied(
                db,
                user,
                action="role_check_failed",
                reason_code=f"required_{'_'.join(sorted(allowed))}_got_{user.role}",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="forbidden",
            )
        return user

    return _dependency


# Clearer alias for endpoints open to every authenticated role.
require_any_authenticated_user = get_current_user


def require_self_or_target_admin(user_id_param: str = "user_id") -> Callable[..., User]:
    """Dependency factory allowing self, super_admin, or the target's school admin.

    ``user_id_param`` names the path/query parameter holding the target user id.
    """

    def _dependency(
        request: Request,
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        target_id = request.path_params.get(user_id_param)
        if target_id is None:
            target_id = request.query_params.get(user_id_param)

        if user.role == UserRole.SUPER_ADMIN:
            return user

        if target_id is not None and str(user.id) == str(target_id):
            return user

        if user.role == UserRole.ADMIN and target_id is not None and user.school_id is not None:
            target = db.get(User, int(target_id))
            if target is not None and target.school_id == user.school_id:
                return user

        logger.warning(
            "self-or-admin access denied: user_id=%s role=%s target=%s",
            user.id,
            str(user.role),
            target_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="forbidden",
        )

    return _dependency


def require_tenant_access(
    tenant_id_param: str = "tenant_id",
    school_id_param: str | None = None,
) -> Callable[..., User]:
    """Dependency factory that hard-gates the request's tenant/school scope.

    Reads ``tenant_id_param`` (and optional ``school_id_param``) from the path
    first, falling back to the query string, and calls
    :func:`enforce_tenant_scope`.
    """

    def _dependency(
        request: Request,
        user: User = Depends(get_current_user),
    ) -> User:
        tenant_id = request.path_params.get(tenant_id_param)
        if tenant_id is None:
            tenant_id = request.query_params.get(tenant_id_param)

        school_id = None
        if school_id_param:
            school_id = request.path_params.get(school_id_param)
            if school_id is None:
                school_id = request.query_params.get(school_id_param)

        enforce_tenant_scope(user, tenant_id, school_id)
        return user

    return _dependency


def require_same_school(school_id_param: str = "school_id") -> Callable[..., User]:
    """Dependency factory: the path/query ``school_id`` must be visible to the user."""

    def _dependency(
        request: Request,
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        raw = request.path_params.get(school_id_param)
        if raw is None:
            raw = request.query_params.get(school_id_param)
        if raw is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="school not found",
            )
        if not can_user_read_school(db, user, int(raw)):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="school not found",
            )
        return user

    return _dependency
