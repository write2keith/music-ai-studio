from datetime import datetime, timedelta, timezone

from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from jose import jwt, JWTError
import logging

from ..config import get_settings

logger = logging.getLogger(__name__)

TOKEN_COOKIE = "session_token"

PUBLIC_PATHS = {
    "/api/health",
    "/api/model-info",
    "/docs",
    "/openapi.json",
    "/redoc",
}

AUTH_ROUTES = {
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/logout",
}


def create_token(user_id: str) -> str:
    settings = get_settings()
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, settings.AUTH_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.AUTH_SECRET, algorithms=["HS256"])
        return payload
    except JWTError:
        return None


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if path in PUBLIC_PATHS or path.startswith("/api/audio/") or path.startswith("/_"):
            return await call_next(request)

        if path in AUTH_ROUTES:
            return await call_next(request)

        token = _extract_token(request)

        if token:
            payload = decode_token(token)
            if payload and "sub" in payload:
                from ..store.users import user_store
                user = user_store.get_by_id(payload["sub"])
                if user:
                    request.state.user = user
                    request.state.user_id = user.id
                    return await call_next(request)

            response = JSONResponse(
                status_code=401,
                content={"error": "Invalid or expired session", "code": "UNAUTHORIZED"},
            )
            response.delete_cookie(key=TOKEN_COOKIE, path="/")
            return response

        settings = get_settings()
        if settings.ENVIRONMENT == "development":
            return await call_next(request)

        return JSONResponse(
            status_code=401,
            content={"error": "Authentication required", "code": "UNAUTHORIZED"},
        )


def _extract_token(request: Request) -> str | None:
    token = request.cookies.get(TOKEN_COOKIE)
    if token:
        return token

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]

    return None
