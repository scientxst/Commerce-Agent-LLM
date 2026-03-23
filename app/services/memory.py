"""Memory and context management service."""
import json
from typing import List, Dict, Any, Optional
from app.models.schemas import ConversationContext, UserPreferences
from app.utils.config import settings


class MemoryService:
    """Manages conversation context and memory."""

    MAX_CONTEXT_TOKENS = settings.MAX_CONTEXT_TOKENS

    def __init__(self, redis_client=None, user_db=None):
        """
        Initialize memory service.

        Args:
            redis_client: Redis client for short-term memory (optional)
            user_db: User database for long-term memory
        """
        self.redis = redis_client
        self.user_db = user_db
        # Fallback to in-memory storage if Redis not available
        self.memory_store: Dict[str, ConversationContext] = {}

    async def get_context(
        self,
        user_id: str,
        session_id: str
    ) -> ConversationContext:
        """
        Build conversation context.

        Args:
            user_id: User identifier
            session_id: Session identifier

        Returns:
            ConversationContext with messages and preferences
        """
        # Try to load from Redis/memory
        context_key = f"{user_id}:{session_id}"
        context = await self._load_from_memory(context_key)

        if not context:
            # Create new context
            user_prefs = await self.user_db.get_preferences(user_id)
            context = ConversationContext(
                user_id=user_id,
                session_id=session_id,
                user_preferences=user_prefs
            )

        return context

    async def save_context(self, context: ConversationContext):
        """
        Save conversation context.

        Args:
            context: Context to save
        """
        context_key = f"{context.user_id}:{context.session_id}"

        # Compress if exceeding token limit
        if await self._count_tokens(context) > self.MAX_CONTEXT_TOKENS:
            context = await self._compress_context(context)

        await self._save_to_memory(context_key, context)

    async def add_message(
        self,
        context: ConversationContext,
        role: str,
        content: str
    ) -> ConversationContext:
        """
        Add message to context.

        Args:
            context: Current context
            role: Message role ('user' or 'assistant')
            content: Message content

        Returns:
            Updated context
        """
        context.messages.append({
            "role": role,
            "content": content
        })

        # Update recent products if mentioned
        if role == "assistant" and "prod_" in content:
            # Extract product IDs (simple regex would work here)
            import re
            product_ids = re.findall(r'prod_\d+', content)
            for pid in product_ids:
                if pid not in context.recent_products:
                    context.recent_products.append(pid)
            # Keep only last 5 recent products
            context.recent_products = context.recent_products[-5:]

        await self.save_context(context)
        return context

    async def _load_from_memory(
        self,
        key: str
    ) -> Optional[ConversationContext]:
        """Load context from Redis or in-memory store."""
        if self.redis:
            # Try Redis
            data = await self.redis.get(f"conv:{key}")
            if data:
                return ConversationContext(**json.loads(data))
        else:
            # Use in-memory store
            return self.memory_store.get(key)

        return None

    async def _save_to_memory(self, key: str, context: ConversationContext):
        """Save context to Redis or in-memory store."""
        if self.redis:
            # Save to Redis with TTL (session duration)
            await self.redis.setex(
                f"conv:{key}",
                3600,  # 1 hour TTL
                json.dumps(context.dict())
            )
        else:
            # Save to in-memory store
            self.memory_store[key] = context

    async def _count_tokens(self, context: ConversationContext) -> int:
        """Estimate token count for context."""
        # Rough estimation: ~4 characters per token
        total_chars = sum(len(msg["content"]) for msg in context.messages)
        return total_chars // 4

    async def _compress_context(
        self,
        context: ConversationContext
    ) -> ConversationContext:
        """
        Compress context when exceeding token limit.

        Strategy: Keep recent messages, summarize older ones.
        """
        # Keep last 5 messages intact
        recent = context.messages[-5:]
        older = context.messages[:-5]

        if older:
            # Summarize older conversation
            summary = await self._summarize_messages(older)
            context.session_data["summary"] = summary

        context.messages = recent
        return context

    async def _summarize_messages(self, messages: List[Dict[str, str]]) -> str:
        """
        Summarize older messages.

        Args:
            messages: Messages to summarize

        Returns:
            Summary text
        """
        # Simple summarization - in production, use LLM
        summary_parts = []
        for msg in messages:
            if "product" in msg["content"].lower():
                summary_parts.append("discussed products")
            if "cart" in msg["content"].lower():
                summary_parts.append("modified cart")
            if "order" in msg["content"].lower():
                summary_parts.append("checked order status")

        if summary_parts:
            return f"Previous conversation: {', '.join(set(summary_parts))}"
        return "Previous conversation covered general shopping inquiries"


class CoreferenceResolver:
    """Resolves pronouns and references to previous entities."""

    async def resolve(
        self,
        message: str,
        context: ConversationContext
    ) -> str:
        """
        Resolve references in message.

        Args:
            message: User message
            context: Conversation context

        Returns:
            Message with references resolved
        """
        resolved = message

        # Extract recent entities from context
        recent_products = context.recent_products

        # Simple pattern matching for common references
        patterns = {
            r"\b(that|this|it)\b": recent_products[0] if recent_products else None,
            r"\b(those|these|them)\b": recent_products[:3] if len(recent_products) > 1 else None,
        }

        # In production, use proper NLP/LLM for coreference resolution
        # For now, just return original message
        return resolved
