"""In-memory user authentication database."""
import uuid
from datetime import datetime
from typing import Dict, Optional
from passlib.context import CryptContext
from pydantic import BaseModel

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class StoredUser(BaseModel):
    id: str
    email: str
    name: str
    hashed_password: Optional[str] = None   # None for OAuth-only users
    provider: str = "email"                 # "email" | "google" | "microsoft"
    provider_id: Optional[str] = None
    avatar: Optional[str] = None
    created_at: str = ""


class AuthDBService:
    """Thread-safe in-memory store for registered users."""

    def __init__(self):
        self._users_by_email: Dict[str, StoredUser] = {}
        self._users_by_id: Dict[str, StoredUser] = {}

    # ── helpers ──────────────────────────────────────────────────

    def _save(self, user: StoredUser) -> None:
        self._users_by_email[user.email] = user
        self._users_by_id[user.id] = user

    # ── lookups ──────────────────────────────────────────────────

    def get_by_email(self, email: str) -> Optional[StoredUser]:
        return self._users_by_email.get(email)

    def get_by_id(self, user_id: str) -> Optional[StoredUser]:
        return self._users_by_id.get(user_id)

    # ── email / password ─────────────────────────────────────────

    def register(self, name: str, email: str, plain_password: str) -> StoredUser:
        user = StoredUser(
            id=str(uuid.uuid4()),
            email=email,
            name=name,
            hashed_password=pwd_context.hash(plain_password),
            provider="email",
            created_at=datetime.utcnow().isoformat(),
        )
        self._save(user)
        return user

    def verify_password(self, plain: str, hashed: str) -> bool:
        return pwd_context.verify(plain, hashed)

    # ── OAuth upsert ─────────────────────────────────────────────

    def upsert_oauth_user(
        self,
        provider: str,
        provider_id: str,
        email: str,
        name: str,
        avatar: Optional[str] = None,
    ) -> StoredUser:
        existing = self.get_by_email(email)
        if existing:
            # Update provider info if logging in via OAuth for first time
            existing.provider = provider
            existing.provider_id = provider_id
            if avatar:
                existing.avatar = avatar
            self._save(existing)
            return existing

        user = StoredUser(
            id=str(uuid.uuid4()),
            email=email,
            name=name,
            provider=provider,
            provider_id=provider_id,
            avatar=avatar,
            created_at=datetime.utcnow().isoformat(),
        )
        self._save(user)
        return user
