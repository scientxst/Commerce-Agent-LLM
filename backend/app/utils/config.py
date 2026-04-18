"""Configuration management."""
import re
from pathlib import Path
from typing import List
from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings

# Walk up from this file to find the .env at project root
_HERE = Path(__file__).resolve()
_ENV_FILE = next(
    (p / ".env" for p in [_HERE.parent, *_HERE.parents] if (p / ".env").exists()),
    ".env",
)


class Settings(BaseSettings):
    """Application settings loaded from .env."""

    # OpenAI
    OPENAI_API_KEY: str
    LLM_MODEL: str = "gpt-4o-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIM: int = 1536

    # RapidAPI — Real-Time Product Search
    RAPIDAPI_KEY: str = ""

    # SerpAPI — Google Shopping
    SERPAPI_KEY: str = Field(
        default="",
        validation_alias=AliasChoices("SERPAPI_KEY", "SERP_API_KEY", "SERPAPI_API_KEY"),
    )

    # Rainforest API — Amazon product data (https://www.rainforestapi.com)
    RAINFOREST_API_KEY: str = ""

    # ScraperAPI — Amazon structured data (https://www.scraperapi.com)
    SCRAPERAPI_KEY: str = ""

    # Open Food Facts — no key required, opt-in via this flag
    OPENFOODFACTS_ENABLED: bool = False

    # Category-specific APIs (both use RAPIDAPI_KEY — no new keys needed)
    ASOS_ENABLED: bool = False          # Fashion: ASOS via RapidAPI
    HOMEDEPOT_ENABLED: bool = False     # Home: Home Depot via RapidAPI

    # Stripe (sandbox)
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # Auth / JWT
    JWT_SECRET: str
    GOOGLE_CLIENT_ID: str = ""
    MICROSOFT_CLIENT_ID: str = ""

    @field_validator("JWT_SECRET")
    @classmethod
    def _strong_jwt_secret(cls, v: str) -> str:
        if not v or len(v) < 32 or "change-me" in v.lower():
            raise ValueError(
                "JWT_SECRET must be set to a random value of at least 32 characters. "
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        return v

    # Frontend URL (used for Stripe redirect URLs).
    # Accepts a single origin OR a comma-separated list (first one is canonical,
    # used for Stripe success/cancel redirects).
    FRONTEND_URL: str = "http://localhost:3000"

    # Optional regex for preview-deploy origins (e.g. Vercel branch URLs).
    # Example: r"^https://commerce-agent-[a-z0-9-]+\.vercel\.app$"
    FRONTEND_URL_PATTERN: str = ""

    @field_validator("FRONTEND_URL")
    @classmethod
    def _validate_frontend_url(cls, v: str) -> str:
        origins = [o.strip().rstrip("/") for o in v.split(",") if o.strip()]
        if not origins:
            raise ValueError("FRONTEND_URL must contain at least one origin")
        url_re = re.compile(r"^https?://[A-Za-z0-9.\-:]+$")
        for o in origins:
            if not url_re.match(o):
                raise ValueError(f"FRONTEND_URL origin is not a valid URL: {o!r}")
        return ",".join(origins)

    @field_validator("FRONTEND_URL_PATTERN")
    @classmethod
    def _validate_frontend_url_pattern(cls, v: str) -> str:
        if not v:
            return v
        try:
            re.compile(v)
        except re.error as exc:
            raise ValueError(f"FRONTEND_URL_PATTERN is not a valid regex: {exc}")
        return v

    @property
    def frontend_origins(self) -> List[str]:
        return [o.strip() for o in self.FRONTEND_URL.split(",") if o.strip()]

    @property
    def canonical_frontend_url(self) -> str:
        """First origin in FRONTEND_URL, used for Stripe success/cancel URLs."""
        return self.frontend_origins[0] if self.frontend_origins else "http://localhost:3000"

    # Application
    MAX_CONTEXT_TOKENS: int = 8000
    MAX_REACT_ITERATIONS: int = 5
    TAX_RATE: float = 0.08
    ENVIRONMENT: str = "development"
    ALLOW_RAPIDAPI_FALLBACK: bool = False  # deprecated — kept for backward compat
    PARALLEL_SEARCH_LIMIT: int = 10

    class Config:
        env_file = str(_ENV_FILE)
        case_sensitive = True
        extra = "ignore"   # ignore VITE_* and other frontend-only vars


settings = Settings()
