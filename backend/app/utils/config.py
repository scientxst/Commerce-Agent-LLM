"""Configuration management."""
from pathlib import Path
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

    # Stripe (sandbox)
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # Auth / JWT
    JWT_SECRET: str = "change-me-in-production-use-a-long-random-secret"
    GOOGLE_CLIENT_ID: str = ""
    MICROSOFT_CLIENT_ID: str = ""

    # Frontend URL (used for Stripe redirect URLs)
    FRONTEND_URL: str = "http://localhost:3000"

    # Application
    MAX_CONTEXT_TOKENS: int = 8000
    MAX_REACT_ITERATIONS: int = 5
    TAX_RATE: float = 0.08
    ENVIRONMENT: str = "development"

    class Config:
        env_file = str(_ENV_FILE)
        case_sensitive = True
        extra = "ignore"   # ignore VITE_* and other frontend-only vars


settings = Settings()
