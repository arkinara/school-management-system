"""FastAPI auth dependencies: current user, role guard, tenant-scope guard."""

from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.auth.jwt import (
    TokenError,
    TokenExpiredError,
    decode_access_token_strict,
)
from app.db.models import User, UserRole
from app.db.session import get_db
from app.middleware.scope import enforce_tenant_scope

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)


def get_current_user(
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token expired",
        ) from exc
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
        ) from exc

    raw_id = payload.get("user_id", payload.get("sub"))
    if raw_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token: missing subject",
        )
    user = db.get(User, int(raw_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="user not found",
        )
    return user


def require_role(*allowed_roles: str | UserRole) -> Callable[..., User]:
    """Dependency factory enforcing membership in ``allowed_roles`` (else 403)."""
    allowed = {str(r) for r in allowed_roles}

    def _dependency(user: User = Depends(get_current_user)) -> User:
        if str(user.role) not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="insufficient role",
            )
        return user

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
