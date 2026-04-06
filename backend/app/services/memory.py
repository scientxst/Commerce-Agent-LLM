"""Memory and context management service."""
import json
import re
import logging
from typing import List, Dict, Any, Optional

from openai import AsyncOpenAI

from app.models.schemas import ConversationContext, UserPreferences
from app.utils.config import settings

log = logging.getLogger(__name__)

# ── Compiled patterns (module-level for performance) ─────────────────────────

_PREFERENCE_SIGNALS = re.compile(
    r'\b(like|prefer|love|always buy|usually get|my size is|budget|'
    r'under \$|less than \$|around \$|max \$|brand|size \d|color|style)\b',
    re.IGNORECASE,
)

_REFERENCE_PATTERN = re.compile(
    r'\b(it|that|this|those|these|them|'
    r'the (first|second|third|last|other) one|'
    r'(that|the) (product|item|one|shoe|shoes|bag|shirt|phone|laptop|headphones?)s?)\b',
    re.IGNORECASE,
)


class MemoryService:
    """Manages conversation context and memory."""

    MAX_CONTEXT_TOKENS = settings.MAX_CONTEXT_TOKENS

    def __init__(self, redis_client=None, user_db=None):
        self.redis = redis_client
        self.user_db = user_db
        self.memory_store: Dict[str, ConversationContext] = {}
        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def get_context(self, user_id: str, session_id: str) -> ConversationContext:
        context_key = f"{user_id}:{session_id}"
        context = await self._load_from_memory(context_key)

        if not context:
            user_prefs = await self.user_db.get_preferences(user_id)
            context = ConversationContext(
                user_id=user_id,
                session_id=session_id,
                user_preferences=user_prefs,
            )

        return context

    async def save_context(self, context: ConversationContext):
        context_key = f"{context.user_id}:{context.session_id}"

        if await self._count_tokens(context) > self.MAX_CONTEXT_TOKENS:
            context = await self._compress_context(context)

        await self._save_to_memory(context_key, context)

    async def add_message(
        self, context: ConversationContext, role: str, content: str
    ) -> ConversationContext:
        context.messages.append({"role": role, "content": content})

        if role == "assistant" and "prod_" in content:
            product_ids = re.findall(r'prod_\d+', content)
            for pid in product_ids:
                if pid not in context.recent_products:
                    context.recent_products.append(pid)
            context.recent_products = context.recent_products[-5:]

        await self.save_context(context)
        return context

    # ── Enhancement 1: Preference extraction ─────────────────────────────────

    async def extract_and_update_preferences(
        self, context: ConversationContext, message: str
    ) -> None:
        """
        Best-effort LLM extraction of brand/size/budget preferences from a user
        message. Updates context.user_preferences in-place. Fire-and-forget safe —
        any failure is logged and silently swallowed.

        BEFORE: Preferences were stored in the schema but never populated from
                conversation text, so search personalization was permanently disabled.
        AFTER:  Any message containing preference signals (brand names, size mentions,
                budget phrases) updates the stored profile that re-ranks search results.
        """
        if not _PREFERENCE_SIGNALS.search(message):
            return

        try:
            resp = await self._client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Extract shopping preferences from this user message. "
                            "Return ONLY valid JSON with optional keys: "
                            '{"brands":["Nike"],"max_price":100,"sizes":["10","M"],"styles":["running"]}. '
                            "Return {} if no clear preferences found."
                        ),
                    },
                    {"role": "user", "content": message},
                ],
                max_tokens=80,
                temperature=0,
            )
            raw = resp.choices[0].message.content.strip()
            data = json.loads(raw)
        except Exception as exc:
            log.debug("Preference extraction skipped: %s", exc)
            return

        if not data:
            return

        if context.user_preferences is None:
            context.user_preferences = UserPreferences()

        prefs = context.user_preferences

        if data.get("brands"):
            prefs.brands = list(
                dict.fromkeys(prefs.brands + [b.title() for b in data["brands"]])
            )[:6]

        if data.get("max_price") is not None:
            prefs.price_range = {"min": 0.0, "max": float(data["max_price"])}

        if data.get("sizes"):
            prefs.sizes = list(dict.fromkeys(prefs.sizes + data["sizes"]))[:4]

        if data.get("styles"):
            prefs.styles = list(dict.fromkeys(prefs.styles + data["styles"]))[:6]

        log.info(
            "Preferences updated for %s — brands=%s price_range=%s sizes=%s",
            context.user_id, prefs.brands, prefs.price_range, prefs.sizes,
        )

    # ── Enhancement 2: LLM memory summarization ───────────────────────────────

    async def _summarize_messages(self, messages: List[Dict[str, str]]) -> str:
        """
        Summarise older conversation turns with a focused LLM call.

        BEFORE: A simple keyword scan that matched "product" / "cart" / "order"
                and returned strings like "Previous conversation: discussed products"
                — completely useless as context for future turns.
        AFTER:  A real 1-2 sentence summary capturing what the user was looking
                for, stated preferences, and cart activity, injected back into
                the context window for future turns.
        """
        conv_text = "\n".join(
            f"{m['role'].upper()}: {m['content'][:300]}"
            for m in messages[-10:]
        )
        try:
            resp = await self._client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Summarize this shopping conversation in 1-2 sentences. "
                            "Capture: what the user was looking for, any brand/size/budget "
                            "preferences they mentioned, and any cart activity. Be concise."
                        ),
                    },
                    {"role": "user", "content": conv_text},
                ],
                max_tokens=80,
                temperature=0,
            )
            return resp.choices[0].message.content.strip()
        except Exception as exc:
            log.warning("LLM summarization failed, using keyword fallback: %s", exc)
            # Keyword fallback — better than nothing
            parts = []
            for m in messages:
                lower = m["content"].lower()
                if any(w in lower for w in ("shoe", "laptop", "shirt", "product", "item")):
                    parts.append("searched for products")
                if "cart" in lower:
                    parts.append("modified cart")
                if "order" in lower:
                    parts.append("checked order status")
            return (
                f"Previous: {', '.join(set(parts))}"
                if parts else
                "Previous general shopping session"
            )

    # ── Internal helpers ──────────────────────────────────────────────────────

    async def _load_from_memory(self, key: str) -> Optional[ConversationContext]:
        if self.redis:
            data = await self.redis.get(f"conv:{key}")
            if data:
                return ConversationContext(**json.loads(data))
        else:
            return self.memory_store.get(key)
        return None

    async def _save_to_memory(self, key: str, context: ConversationContext):
        if self.redis:
            await self.redis.setex(
                f"conv:{key}", 3600, json.dumps(context.dict())
            )
        else:
            self.memory_store[key] = context

    async def _count_tokens(self, context: ConversationContext) -> int:
        total_chars = sum(len(msg["content"]) for msg in context.messages)
        return total_chars // 4

    async def _compress_context(self, context: ConversationContext) -> ConversationContext:
        recent = context.messages[-5:]
        older = context.messages[:-5]
        if older:
            summary = await self._summarize_messages(older)
            context.session_data["summary"] = summary
        context.messages = recent
        return context


# ── Enhancement 3: Real Coreference Resolution ────────────────────────────────

class CoreferenceResolver:
    """
    Resolves vague pronouns and references to recently shown products.

    BEFORE: The resolve() method was a documented stub — it detected reference
            patterns with regex but then returned `resolved = message` (the
            original) unchanged. "Add it to cart" / "show me more like that"
            reached the router with no context, causing wrong or failed tool calls.

    AFTER:  When a reference pattern is detected, a small LLM call uses the
            last 2 assistant turns (which contain product names/IDs) to rewrite
            the user message with explicit references, e.g.:
              "add it to cart" → "add Nike Air Zoom Pegasus (prod_42) to cart"
            The resolved message is then routed and searched with full context.
    """

    def __init__(self, openai_client: AsyncOpenAI):
        self._client = openai_client

    async def resolve(self, message: str, context: ConversationContext) -> str:
        """
        Rewrite `message` with pronouns replaced by explicit product references
        drawn from recent assistant turns. Returns original message unchanged if
        no references are detected or resolution fails.
        """
        if not _REFERENCE_PATTERN.search(message):
            return message

        # Need at least one assistant turn with product context
        recent_assistant = [
            m["content"][:500]
            for m in context.messages[-6:]
            if m["role"] == "assistant"
        ]
        if not recent_assistant:
            return message

        ref_context = "\n".join(recent_assistant[-2:])

        try:
            resp = await self._client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You resolve vague references in shopping messages. "
                            "Given recent assistant responses and a user message, "
                            "rewrite the user message replacing any pronouns or vague references "
                            "(it, that, this, those, the first one, etc.) with the specific "
                            "product name or ID they refer to from the context. "
                            "If you cannot determine what is being referenced, return the "
                            "original message exactly. Return ONLY the rewritten message."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Recent assistant context:\n{ref_context}\n\n"
                            f"Resolve this user message: {message}"
                        ),
                    },
                ],
                max_tokens=120,
                temperature=0,
            )
            resolved = resp.choices[0].message.content.strip()
            if resolved and resolved != message:
                log.info(
                    "Coreference resolved: %r → %r",
                    message[:80], resolved[:80],
                )
            return resolved or message
        except Exception as exc:
            log.warning("Coreference resolution failed: %s", exc)
            return message
