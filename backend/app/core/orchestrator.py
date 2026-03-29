"""Orchestration engine using real ReAct pattern with OpenAI function calling."""
import json
import logging
import re
from typing import Dict, Any, AsyncIterator

from openai import AsyncOpenAI

from app.core.guardrails import GuardrailsEngine
from app.tools.executor import ToolExecutor
from app.tools.registry import TOOL_DEFINITIONS
from app.services.memory import MemoryService
from app.utils.config import settings

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are ShopAssist — a friendly, conversational AI that helps people shop. You can also just chat naturally about anything.

PERSONALITY:
- Be warm, casual, genuine. Talk like a helpful friend, not a product catalog.
- You can discuss ANY topic — time, weather, jokes, advice, trivia. You are not limited to shopping.
- When the conversation naturally relates to products, gently offer to help find something. Never force it.

WHEN TO USE TOOLS (critical — read carefully):
- ONLY call search_products or browse_category when the user is clearly asking about a PRODUCT they want to find, buy, or compare.
- Examples of SHOPPING intent (USE tools): "show me running shoes", "find me a laptop under $500", "I need a gift for my mom", "red hoodie size M"
- Examples of NON-SHOPPING intent (NEVER use tools): "what time is it", "tell me the time", "how are you", "what's the weather", "tell me a joke", "who are you", "answer my question", "what can you do", "thanks"
- If the user says something ambiguous, respond conversationally and ASK what they're looking for. Do NOT search.
- The word "time" by itself is NOT a product search. "watch" by itself IS a product search.
- When in doubt, DON'T call a tool. Just respond naturally.

TOOL RULES:
1. ONLY use tools for clear shopping intent. Everything else gets a natural conversational response with NO tool calls.
2. Never invent prices, discounts, or promo codes. Use ONLY data returned by tools.
3. Never claim a product is in stock without verifying via tools.
4. When presenting products, mention merchant name and price.
5. If the user asks to add something to cart, use the add_to_cart tool.

RESPONSE STYLE:
- Keep it concise — no walls of text.
- For product results, short friendly intro then list items.
- After showing products, ask a natural follow-up ("Want me to filter by budget or color?").
- For non-shopping conversations, be helpful and naturally mention you can help with shopping if relevant.

User context:
- Recent products: {recent_products}
- Cart: {cart_info}
- Preferences: {preferences}"""

# Simple greeting detector — used ONLY as a latency optimisation to skip
# the ReAct loop for obvious greetings. NOT used for correctness — the LLM
# handles all intent classification for non-trivial messages.
_GREETING_RE = re.compile(
    r"^\s*(hi+|hey+|hello+|howdy|hiya|yo+|greetings|"
    r"what'?s\s*up|sup|what'?s\s*good|what'?s\s*new|"
    r"how\s*are\s*(you|u)\??|how'?s\s*it\s*going\??|"
    r"good\s*(morning|afternoon|evening|day)|"
    r"thanks|thank\s*you|thx|ty|"
    r"bye|goodbye|see\s*ya|later|"
    r"ok(ay)?|cool|nice|great|awesome|sounds\s*good|got\s*it|"
    r"sure|yep|yeah|nope|lol|lmao|haha)\s*[!.?,]*\s*$",
    re.IGNORECASE,
)


def _is_simple_greeting(message: str) -> bool:
    """True only for obvious greetings/acks — used as a latency fast-path."""
    stripped = message.strip()
    if _GREETING_RE.match(stripped):
        return True
    # Very short messages (≤4 words) that start with a greeting word
    if len(stripped.split()) <= 4 and re.match(
        r"^\s*(hi+|hey+|hello+|howdy|yo+|sup)\b", stripped, re.IGNORECASE
    ):
        return True
    return False


class OrchestrationEngine:
    """Processes user messages through guardrails -> ReAct tool loop -> streaming response."""

    def __init__(self, guardrails: GuardrailsEngine, tool_executor: ToolExecutor, memory: MemoryService):
        self.guardrails = guardrails
        self.executor = tool_executor
        self.memory = memory
        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def process_message(
        self, user_id: str, session_id: str, message: str
    ) -> AsyncIterator[Dict[str, Any]]:
        """Full pipeline: guardrails -> ReAct -> stream response."""

        # --- Pre-check guardrails ---
        blocked = self.guardrails.check_input(message)
        if blocked:
            yield {"type": "text", "content": blocked}
            yield {"type": "done"}
            return

        # --- Load conversation context ---
        ctx = await self.memory.get_context(user_id, session_id)
        await self.memory.add_message(ctx, "user", message)

        # --- Build messages for the LLM ---
        recent = ", ".join(ctx.recent_products[-3:]) if ctx.recent_products else "none"
        cart_info = f"{len(ctx.cart_items)} items" if ctx.cart_items else "empty"
        prefs = str(ctx.user_preferences) if ctx.user_preferences else "not set"

        messages = [
            {
                "role": "system",
                "content": SYSTEM_PROMPT.format(
                    recent_products=recent, cart_info=cart_info, preferences=prefs
                ),
            }
        ]
        # Include last few conversation turns
        for m in ctx.messages[-8:]:
            messages.append({"role": m["role"], "content": m["content"]})

        # ----------------------------------------------------------------
        # FAST PATH — simple greetings skip the tool loop (latency only).
        # This is purely an optimisation. All real intent classification
        # is done by the LLM in the main path below.
        # ----------------------------------------------------------------
        if _is_simple_greeting(message):
            log.info("Simple greeting — fast path (no tools)")
            full_response = ""
            try:
                stream = await self._client.chat.completions.create(
                    model=settings.LLM_MODEL,
                    messages=messages,
                    stream=True,
                )
                async for chunk in stream:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        full_response += delta.content
                        yield {"type": "text", "content": delta.content}
            except Exception as exc:
                log.error("LLM streaming failed (greeting): %s", exc)
                full_response = "Hey! How can I help you today?"
                yield {"type": "text", "content": full_response}

            full_response = self.guardrails.check_output(full_response)
            await self.memory.add_message(ctx, "assistant", full_response)
            yield {"type": "done"}
            return

        # ----------------------------------------------------------------
        # MAIN PATH — LLM decides whether to use tools or respond naturally.
        # The system prompt tells it exactly when to search vs. chat.
        # We trust the LLM's judgment — no regex overrides.
        # ----------------------------------------------------------------
        products_collected = []
        llm_error = False

        for iteration in range(settings.MAX_REACT_ITERATIONS):
            try:
                resp = await self._client.chat.completions.create(
                    model=settings.LLM_MODEL,
                    messages=messages,
                    tools=TOOL_DEFINITIONS,
                    tool_choice="auto",
                )
            except Exception as exc:
                log.error("LLM call failed: %s", exc)
                llm_error = True
                break

            assistant_msg = resp.choices[0].message

            if not assistant_msg.tool_calls:
                # LLM decided no tools needed — this IS the answer.
                # For non-shopping messages ("tell me the time", "answer my
                # question", etc.) this is the correct, expected path.
                if assistant_msg.content:
                    # The LLM already produced its final answer in this
                    # non-streaming call. Stream it out to the client.
                    yield {"type": "text", "content": assistant_msg.content}
                    full_response = assistant_msg.content
                    full_response = self.guardrails.check_output(full_response)
                    await self.memory.add_message(ctx, "assistant", full_response)
                    yield {"type": "done"}
                    return
                break

            messages.append(assistant_msg.model_dump(exclude_none=True))

            for tc in assistant_msg.tool_calls:
                tool_name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    args = {}

                log.info("ReAct iter %d: %s(%s)", iteration, tool_name, args)
                result_str = await self.executor.run(tool_name, args, user_id)

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result_str,
                })

                try:
                    result_data = json.loads(result_str)
                    if "products" in result_data:
                        products_collected.extend(result_data["products"])
                except (json.JSONDecodeError, TypeError):
                    pass

        # Fallback search ONLY on actual LLM API failure
        if llm_error and not products_collected:
            log.info("LLM error — running fallback search for: %s", message[:80])
            try:
                fallback_result = await self.executor.run(
                    "search_products", {"query": message}, user_id
                )
                fallback_data = json.loads(fallback_result)
                if "products" in fallback_data:
                    products_collected.extend(fallback_data["products"])
                    messages.append({
                        "role": "system",
                        "content": f"[System: search returned {len(fallback_data['products'])} results. Present these to the user.]"
                    })
            except Exception as exc:
                log.warning("Fallback search failed: %s", exc)

        # Stream final response (after tool calls completed)
        full_response = ""
        try:
            stream = await self._client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=messages,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    full_response += delta.content
                    yield {"type": "text", "content": delta.content}
        except Exception as exc:
            log.error("LLM streaming failed: %s", exc)
            if products_collected:
                full_response = f"I found {len(products_collected)} product{'s' if len(products_collected) != 1 else ''} for you — check them out in the results panel! Want me to filter by budget or anything else?"
            else:
                full_response = "Sorry, something went wrong on my end. Could you try again?"
            yield {"type": "text", "content": full_response}

        # Send deduplicated product cards
        if products_collected:
            seen_ids: set = set()
            unique_products = []
            for p in products_collected:
                pid = p.get("id")
                if pid and pid not in seen_ids:
                    seen_ids.add(pid)
                    unique_products.append(p)
            yield {"type": "products", "products": unique_products}

        full_response = self.guardrails.check_output(full_response)
        await self.memory.add_message(ctx, "assistant", full_response)
        yield {"type": "done"}
