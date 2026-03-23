"""Authentication endpoints: email/password + Google + Microsoft OAuth."""
import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr

from app.utils.config import settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login/email")

# ── Injected from main.py after startup ──────────────────────────
_auth_db = None

def set_auth_db(db):
    global _auth_db
    _auth_db = db

def get_auth_db():
    return _auth_db


# ── JWT helpers ───────────────────────────────────────────────────

def _create_jwt(user_id: str, email: str, name: str, provider: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "provider": provider,
        "exp": datetime.utcnow() + timedelta(days=7),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def current_user(token: str = Depends(oauth2_scheme)) -> dict:
    return decode_jwt(token)


# ── Request / Response models ─────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class OAuthTokenRequest(BaseModel):
    token: str          # ID token (Google) or access token (Microsoft)


# ── Email / password ──────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest):
    db = get_auth_db()
    if db.get_by_email(body.email):
        raise HTTPException(status_code=400, detail="Email already registered")

    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user = db.register(name=body.name, email=body.email, plain_password=body.password)
    token = _create_jwt(user.id, user.email, user.name, user.provider)
    return TokenResponse(access_token=token, user={"id": user.id, "name": user.name, "email": user.email, "provider": user.provider, "avatar": user.avatar})


@router.post("/login/email", response_model=TokenResponse)
async def login_email(form: OAuth2PasswordRequestForm = Depends()):
    """Standard OAuth2 password flow (username = email)."""
    db = get_auth_db()
    user = db.get_by_email(form.username)
    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not db.verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = _create_jwt(user.id, user.email, user.name, user.provider)
    return TokenResponse(access_token=token, user={"id": user.id, "name": user.name, "email": user.email, "provider": user.provider, "avatar": user.avatar})


# ── Google OAuth ──────────────────────────────────────────────────

@router.post("/google", response_model=TokenResponse)
async def login_google(body: OAuthTokenRequest):
    """Verify a Google ID token and return our own JWT."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as g_requests
        idinfo = id_token.verify_oauth2_token(
            body.token, g_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except Exception as e:
        log.warning("Google token verification failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid Google token")

    db = get_auth_db()
    user = db.upsert_oauth_user(
        provider="google",
        provider_id=idinfo["sub"],
        email=idinfo["email"],
        name=idinfo.get("name", idinfo["email"].split("@")[0]),
        avatar=idinfo.get("picture"),
    )
    token = _create_jwt(user.id, user.email, user.name, "google")
    return TokenResponse(access_token=token, user={"id": user.id, "name": user.name, "email": user.email, "provider": "google", "avatar": user.avatar})


# ── Microsoft / Outlook OAuth ─────────────────────────────────────

@router.post("/microsoft", response_model=TokenResponse)
async def login_microsoft(body: OAuthTokenRequest):
    """Verify a Microsoft access token via Graph /me and return our own JWT."""
    if not settings.MICROSOFT_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Microsoft OAuth not configured")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {body.token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Microsoft token")

    profile = resp.json()
    email = profile.get("mail") or profile.get("userPrincipalName", "")
    if not email:
        raise HTTPException(status_code=400, detail="Could not retrieve email from Microsoft account")

    db = get_auth_db()
    user = db.upsert_oauth_user(
        provider="microsoft",
        provider_id=profile["id"],
        email=email,
        name=profile.get("displayName", email.split("@")[0]),
    )
    token = _create_jwt(user.id, user.email, user.name, "microsoft")
    return TokenResponse(access_token=token, user={"id": user.id, "name": user.name, "email": user.email, "provider": "microsoft", "avatar": user.avatar})


# ── Current user ──────────────────────────────────────────────────

@router.get("/me")
async def me(payload: dict = Depends(current_user)):
    return payload
