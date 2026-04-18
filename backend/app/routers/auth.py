"""Authentication endpoints: email/password + Google + Microsoft OAuth + guest."""
import logging
import time
import uuid
from collections import deque
from datetime import datetime, timedelta
from typing import Deque, Dict, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr

from app.utils.config import settings

log = logging.getLogger(__name__)
audit = logging.getLogger("audit")

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login/email")

# ── Injected from main.py after startup ──────────────────────────
_auth_db = None

def set_auth_db(db):
    global _auth_db
    _auth_db = db

def get_auth_db():
    return _auth_db


# ── JTI revocation (in-memory) ────────────────────────────────────
# Maps jti -> expiry unix-seconds. On decode, we reject revoked tokens.
# On every write, we sweep expired entries so the dict cannot grow without
# bound. For a multi-instance deployment, swap in Redis; the shape here is
# deliberately trivial to port.
_revoked_jti: Dict[str, int] = {}

def _sweep_revoked() -> None:
    now = int(time.time())
    for jti in [j for j, exp in _revoked_jti.items() if exp <= now]:
        _revoked_jti.pop(jti, None)

def revoke_jti(jti: str, exp_unix: int) -> None:
    _sweep_revoked()
    _revoked_jti[jti] = exp_unix


# ── Rate limit for /auth/guest (in-memory, per-IP sliding window) ─
# Keeps a deque of recent mint times per IP; rejects once the caller
# exceeds MAX mints in WINDOW seconds. Not DDoS-proof on its own, but
# stops the trivial scripted-abuse path flagged in the adversarial
# review (finding 1.1).
_GUEST_MAX = 10
_GUEST_WINDOW = 60
_guest_buckets: Dict[str, Deque[float]] = {}

def _guest_rate_limit(ip: str) -> Tuple[bool, int]:
    """Return (allowed, retry_after_seconds)."""
    now = time.monotonic()
    bucket = _guest_buckets.setdefault(ip, deque())
    while bucket and now - bucket[0] > _GUEST_WINDOW:
        bucket.popleft()
    if len(bucket) >= _GUEST_MAX:
        retry = int(_GUEST_WINDOW - (now - bucket[0])) + 1
        return False, max(1, retry)
    bucket.append(now)
    return True, 0


# ── JWT helpers ───────────────────────────────────────────────────

def _create_jwt(
    user_id: str,
    email: str,
    name: str,
    provider: str,
    *,
    ttl_seconds: Optional[int] = None,
    ttl_days: int = 7,
) -> str:
    exp = datetime.utcnow() + (
        timedelta(seconds=ttl_seconds) if ttl_seconds is not None
        else timedelta(days=ttl_days)
    )
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "provider": provider,
        "jti": uuid.uuid4().hex,
        "exp": exp,
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def decode_jwt(token: str) -> dict:
    """Decode and validate a JWT. Pins HS256 (rejects alg:none and RS*/ES*
    key-confusion variants) and enforces the JTI denylist."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "jti", "iat"]},
        )
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    jti = payload.get("jti")
    if jti and jti in _revoked_jti:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    return payload


async def current_user(token: str = Depends(oauth2_scheme)) -> dict:
    return decode_jwt(token)


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _audit(event: str, *, request: Request, sub: str = "", detail: str = "") -> None:
    """Structured one-line audit log for auth events."""
    ua = request.headers.get("user-agent", "")[:120]
    audit.info(
        "auth_event event=%s sub=%s ip=%s ua=%r detail=%s",
        event, sub or "-", _client_ip(request), ua, detail or "-",
    )


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
async def register(body: RegisterRequest, request: Request):
    db = get_auth_db()
    if db.get_by_email(body.email):
        raise HTTPException(status_code=400, detail="Email already registered")

    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user = db.register(name=body.name, email=body.email, plain_password=body.password)
    token = _create_jwt(user.id, user.email, user.name, user.provider)
    _audit("register", request=request, sub=user.id, detail=user.provider)
    return TokenResponse(access_token=token, user={"id": user.id, "name": user.name, "email": user.email, "provider": user.provider, "avatar": user.avatar})


@router.post("/login/email", response_model=TokenResponse)
async def login_email(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    """Standard OAuth2 password flow (username = email)."""
    db = get_auth_db()
    user = db.get_by_email(form.username)
    if not user or not user.hashed_password:
        _audit("login_failed", request=request, detail=f"email={form.username[:80]}")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not db.verify_password(form.password, user.hashed_password):
        _audit("login_failed", request=request, sub=user.id, detail="bad_password")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = _create_jwt(user.id, user.email, user.name, user.provider)
    _audit("login", request=request, sub=user.id, detail=user.provider)
    return TokenResponse(access_token=token, user={"id": user.id, "name": user.name, "email": user.email, "provider": user.provider, "avatar": user.avatar})


# ── Google OAuth ──────────────────────────────────────────────────

@router.post("/google", response_model=TokenResponse)
async def login_google(body: OAuthTokenRequest, request: Request):
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
        _audit("login_failed", request=request, detail="google_token_invalid")
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
    _audit("login", request=request, sub=user.id, detail="google")
    return TokenResponse(access_token=token, user={"id": user.id, "name": user.name, "email": user.email, "provider": "google", "avatar": user.avatar})


# ── Microsoft / Outlook OAuth ─────────────────────────────────────

@router.post("/microsoft", response_model=TokenResponse)
async def login_microsoft(body: OAuthTokenRequest, request: Request):
    """Verify a Microsoft access token via Graph /me and return our own JWT."""
    if not settings.MICROSOFT_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Microsoft OAuth not configured")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {body.token}"},
        )

    if resp.status_code != 200:
        _audit("login_failed", request=request, detail=f"microsoft_status={resp.status_code}")
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
    _audit("login", request=request, sub=user.id, detail="microsoft")
    return TokenResponse(access_token=token, user={"id": user.id, "name": user.name, "email": user.email, "provider": "microsoft", "avatar": user.avatar})


# ── Guest ─────────────────────────────────────────────────────────

# 59 minutes. A guest that needs longer has signalled engagement; prompt
# them to register. Reduces the blast radius of a leaked guest token from
# a full day to just under an hour.
GUEST_TTL_SECONDS = 59 * 60


@router.post("/guest", response_model=TokenResponse)
async def create_guest(request: Request):
    """Mint a short-lived JWT for an anonymous guest session.

    The guest ID is a server-generated UUID, so it is not guessable by
    other clients. Rate-limited per IP to blunt scripted abuse.
    """
    ip = _client_ip(request)
    allowed, retry = _guest_rate_limit(ip)
    if not allowed:
        _audit("guest_rate_limited", request=request, detail=f"retry_after={retry}s")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many guest sessions from this IP. Please try again later.",
            headers={"Retry-After": str(retry)},
        )

    gid = f"guest_{uuid.uuid4().hex}"
    token = _create_jwt(
        gid, email="", name="Guest", provider="guest",
        ttl_seconds=GUEST_TTL_SECONDS,
    )
    _audit("guest_mint", request=request, sub=gid)
    return TokenResponse(
        access_token=token,
        user={"id": gid, "name": "Guest", "email": None, "provider": "guest", "avatar": None},
    )


# ── Logout ────────────────────────────────────────────────────────

@router.post("/logout")
async def logout(request: Request, payload: dict = Depends(current_user)):
    """Revoke the caller's JWT by adding its jti to the in-memory denylist.

    The token will be rejected by `decode_jwt` until its natural expiry.
    This is a best-effort control on a stateless JWT scheme; production
    should layer on short-lived access tokens + refresh rotation.
    """
    jti = payload.get("jti")
    exp = payload.get("exp")
    if jti and exp:
        revoke_jti(jti, int(exp))
    _audit("logout", request=request, sub=payload.get("sub", ""))
    return {"ok": True}


# ── Current user ──────────────────────────────────────────────────

@router.get("/me")
async def me(payload: dict = Depends(current_user)):
    return payload
