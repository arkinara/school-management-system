"""Tenant/school scoping: ASGI context middleware + hard-scope enforcement.

The ASGI middleware is non-blocking: it decodes the bearer token and attaches
``request.state.user``/``tenant_id``/``school_id``/``role`` so downstream
dependencies and routers can enforce scope. :func:`enforce_tenant_scope` is the
hard gate domain routers call to reject cross-tenant/cross-school access.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp

from app.auth.jwt import JWT_ALGORITHM, JWT_SECRET
from app.db.models import User, UserRole
from app.db.session import SessionLocal


class TenantScopeMiddleware(BaseHTTPMiddleware):
    """Attach verified JWT claims (and the User, when resolvable) to the request."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        request.state.user = None
        request.state.tenant_id = None
        request.state.school_id = None
        request.state.role = None

        auth_header = request.headers.get("Authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
            try:
                payload: dict[str, Any] = jwt.decode(
                    token, JWT_SECRET, algorithms=[JWT_ALGORITHM]
                )
            except JWTError:
                payload = {}
            if payload:
                request.state.tenant_id = payload.get("tenant_id")
                request.state.school_id = payload.get("school_id")
                request.state.role = payload.get("role")
                user_id = payload.get("user_id")
                if user_id is not None:
                    db = SessionLocal()
                    try:
                        request.state.user = db.get(User, int(user_id))
                    finally:
                        db.close()

        return await call_next(request)


def enforce_tenant_scope(
    user: User,
    tenant_id_param: Any,
    school_id_param: Any | None = None,
) -> None:
    """Raise 403 unless the user may access the requested tenant/school scope.

    ``super_admin`` is the only role that bypasses tenant and school boundaries.
    """
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication required",
        )

    if user.role == UserRole.SUPER_ADMIN:
        return

    if tenant_id_param is not None and str(user.tenant_id) != str(tenant_id_param):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="cross-tenant access denied",
        )

    if (
        school_id_param is not None
        and user.school_id is not None
        and str(user.school_id) != str(school_id_param)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="cross-school access denied",
        )
