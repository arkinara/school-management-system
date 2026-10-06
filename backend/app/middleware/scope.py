"""Tenant/school scoping: ASGI context middleware + hard-scope enforcement.

The ASGI middleware is intentionally a no-op beyond setting default (empty)
``request.state`` values: it never opens a database session. The authenticated
user and its tenant/school scope are resolved lazily in
:func:`app.auth.deps.get_current_user` via the injected ``get_db`` session,
which tests can override. :func:`enforce_tenant_scope` is the hard gate domain
routers call to reject cross-tenant/cross-school access.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp

from app.db.models import User, UserRole


class TenantScopeMiddleware(BaseHTTPMiddleware):
    """Set default scope state; real auth/scope is resolved in dependencies."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        request.state.user = None
        request.state.tenant_id = None
        request.state.school_id = None
        request.state.role = None
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
