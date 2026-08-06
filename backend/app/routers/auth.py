from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr

from ..config import get_settings
from ..store.users import user_store
from ..middleware.auth import create_token, decode_token, TOKEN_COOKIE

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


class RegisterRequest(BaseModel):
    email: str
    name: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    user: dict
    message: str


@router.post("/register", response_model=AuthResponse)
async def register(body: RegisterRequest, response: Response):
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if len(body.name.strip()) < 1:
        raise HTTPException(status_code=400, detail="Name is required")

    try:
        user = user_store.create(
            email=body.email,
            name=body.name.strip(),
            password=body.password,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    token = create_token(user.id)
    _set_cookie(response, token)

    return AuthResponse(user=user.to_dict(), message="Account created successfully")


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, response: Response):
    user = user_store.authenticate(body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(user.id)
    _set_cookie(response, token)

    return AuthResponse(user=user.to_dict(), message="Logged in successfully")


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(
        key=TOKEN_COOKIE,
        path="/",
        samesite="lax",
    )
    return {"message": "Logged out"}


@router.get("/me")
async def me(request: Request):
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user": user.to_dict()}


def _get_user_or_none(request: Request):
    return getattr(request.state, "user", None)


def _set_cookie(response: Response, token: str):
    response.set_cookie(
        key=TOKEN_COOKIE,
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
        max_age=60 * 60 * 24 * 30,
    )
