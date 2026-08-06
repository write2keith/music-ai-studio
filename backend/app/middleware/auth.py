from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import logging

logger = logging.getLogger(__name__)

PUBLIC_PATHS = {
    "/api/health",
    "/api/model-info",
    "/docs",
    "/openapi.json",
    "/redoc",
}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if path in PUBLIC_PATHS or path.startswith("/api/audio/") or path.startswith("/_"):
            return await call_next(request)

        session_token = request.cookies.get("session_token")
        auth_header = request.headers.get("Authorization", "")

        if auth_header.startswith("Bearer "):
            api_key = auth_header[7:]
            if not _validate_api_key(api_key):
                return JSONResponse(
                    status_code=401,
                    content={"error": "Invalid API key", "code": "UNAUTHORIZED"},
                )

        if not session_token and not auth_header:
            # In development mode, allow unauthenticated access
            from ..config import get_settings
            settings = get_settings()
            if settings.ENVIRONMENT == "development":
                return await call_next(request)

            return JSONResponse(
                status_code=401,
                content={"error": "Authentication required", "code": "UNAUTHORIZED"},
            )

        response = await call_next(request)
        return response


def _validate_api_key(key: str) -> bool:
    return len(key) >= 20
