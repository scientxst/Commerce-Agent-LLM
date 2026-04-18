"""Orchestration engine — two-call routing architecture.

Call 1 (router): LLM with NO tools. Replies either:
  - "SEARCH_PRODUCTS" → user wants to shop → proceed to ReAct tool loop
  - Any other text    → conversational reply → send directly to user

No regex-based intent detection. The LLM classifies all messages.
"""
import json
import logging
from datetime import datetime
from typing import Dict, Any, AsyncIterator, Optional

from openai import AsyncOpenAI

from app.core.guardrails import GuardrailsEngine
from app.tools.executor import ToolExecutor
from app.tools.registry import TOOL_DEFINITIONS
from app.services.memory import MemoryService, CoreferenceResolver
from app.utils.config import settings

log = logging.getLogger(__name__)

# ── Router system prompt ──────────────────────────────────────────────────────
ROUTER_PROMPT = """You are ShopAssist — a warm, friendly AI that can chat about anything AND help people shop.

YOUR TASK: Read the user's latest message and decide:

If the user wants to FIND, BUY, BROWSE, or COMPARE products → reply with EXACTLY this one word: SEARCH_PRODUCTS

If the user is doing ANYTHING ELSE (chatting, asking questions, saying hi, asking about time/weather/jokes/advice, saying thanks, etc.) → respond NATURALLY and helpfully as a friendly assistant. Answer their actual question. You can gently mention shopping help if relevant, but don't force it.

WHEN TO REPLY "SEARCH_PRODUCTS" (product intent):
- "show me running shoes", "find me a laptop under $500", "I need a gift for my mom"
- "red hoodie size M", "wireless earbuds with ANC", "standing desk under $300"
- "what watches do you have", "browse electronics"
- "add this to my cart", "add the first one", "put that in my cart", "I'll take it"
- "remove from cart", "what's in my cart", "show my cart", "checkout"

WHEN TO RESPOND NATURALLY (everything else):
- "tell me the time" → use the current_datetime from your context and reply with the actual time
- "whats 2+2" → "That's 4! Easy one 😄 Anything I can help you find today?"
- "hey whats up" → "Hey! Not much, just here to help. What are you looking for?"
- "how are you" → "Doing great, thanks for asking! What can I help you with?"
- "are you a bot" → "Yep, I'm an AI shopping assistant! Ask me anything or let me help you find something."
- "answer my question" → "Of course! What's your question?"
- "what can you do" → "I can help you find products, compare options, manage your cart, and just chat!"
- "thanks" → "Anytime! Let me know if you need anything else."

Current date/time: {current_datetime} | User's cart: {cart_info} | Recent products viewed: {recent_products}"""

# ── Shopping system prompt (used only in ReAct tool loop) ────────────────────
SHOPPING_PROMPT = """You are ShopAssist — helping a user find products to buy.

Use the search and browse tools to find relevant products, then present them warmly.

RULES:
1. Always use search_products or browse_category. Never answer from memory.
2. Never invent prices or stock. Only use tool results.
3. Format results as a quick-scan comparison. Use this exact format:

   Found **X items** | $lowest - $highest

   | # | Product | Price | Rating | Seller |
   |---|---------|-------|--------|--------|
   | 1 | Name here | $XX | 4.X stars | Merchant |
   | 2 | Name here | $XX | 4.X stars | Merchant |
   | 3 | Name here | $XX | 4.X stars | Merchant |

   Show the top 4-5 products only. Keep product names short (truncate if needed).

4. After the table, add ONE sentence with your top pick and why, then a follow-up question.
5. Do NOT include image URLs, product URLs, descriptions, or feature lists. The product cards on the right panel already show all of that.
6. If user wants to add to cart, use add_to_cart with the product_id from the search results.

User context:
- Recent products: {recent_products}
- Cart: {cart_info}
- Preferences: {preferences}"""


class OrchestrationEngine:
    """Two-call router: classify intent → conversational reply OR ReAct tool loop."""

    def __init__(self, guardrails: GuardrailsEngine, tool_executor: ToolExecutor, memory: MemoryService):
        self.guardrails = guardrails
        self.executor = tool_executor
        self.memory = memory
        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self._resolver = CoreferenceResolver(self._client)

    async def process_message(
        self, user_id: str, session_id: str, message: str,
        category: Optional[str] = None,
    ) -> AsyncIterator[Dict[str, Any]]:

        # ── Guardrails ──────────────────────────────────────────────────────
        blocked = self.guardrails.check_input(message)
        if blocked:
            yield {"type": "text", "content": blocked}
            return

        # ── Memory ──────────────────────────────────────────────────────────
        ctx = await self.memory.get_context(user_id, session_id)

        # Resolve vague references ("it", "that one") using recent context
        message = await self._resolver.resolve(message, ctx)

        # Extract & persist any preference signals before routing
        await self.memory.extract_and_update_preferences(ctx, message)

        await self.memory.add_message(ctx, "user", message)

        recent    = ", ".join(ctx.recent_products[-3:]) if ctx.recent_products else "none"
        cart_info = f"{len(ctx.cart_items)} items" if ctx.cart_items else "empty"
        prefs     = str(ctx.user_preferences) if ctx.user_preferences else "not set"

        history = [{"role": m["role"], "content": m["content"]} for m in ctx.messages[-8:]]

        # ── Call 1: Router — no tools, classifies intent ─────────────────────
        router_messages = [
            {"role": "system", "content": ROUTER_PROMPT.format(
                cart_info=cart_info,
                recent_products=recent,
                current_datetime=datetime.now().strftime("%A, %B %d %Y, %I:%M %p"),
            )}
        ] + history

        try:
            router_resp = await self._client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=router_messages,
                max_tokens=500,
                temperature=0.7,
            )
            router_content = (router_resp.choices[0].message.content or "").strip()
        except Exception as exc:
            log.error("Router call failed: %s", exc)
            router_content = ""

        log.info("Router → %r (message: %r)", router_content[:60], message[:60])

        # ── Conversational path ─────────────────────────────────────────────
        if "SEARCH_PRODUCTS" not in router_content.upper():
            reply = router_content or "Hey! How can I help you today?"
            yield {"type": "text", "content": reply}
            await self.memory.add_message(ctx, "assistant", self.guardrails.check_output(reply))
            return

        # ── Shopping path: full ReAct tool loop ──────────────────────────────
        log.info("Shopping intent — entering ReAct loop")

        shopping_messages = [
            {"role": "system", "content": SHOPPING_PROMPT.format(
                recent_products=recent, cart_info=cart_info, preferences=prefs
            )}
        ] + history

        products_collected = []
        llm_error = False

        for iteration in range(settings.MAX_REACT_ITERATIONS):
            try:
                resp = await self._client.chat.completions.create(
                    model=settings.LLM_MODEL,
                    messages=shopping_messages,
                    tools=TOOL_DEFINITIONS,
                    tool_choice="auto",
                )
            except Exception as exc:
                log.error("Shopping LLM call failed: %s", exc)
                llm_error = True
                break

            assistant_msg = resp.choices[0].message

            if not assistant_msg.tool_calls:
                break

            shopping_messages.append(assistant_msg.model_dump(exclude_none=True))

            for tc in assistant_msg.tool_calls:
                tool_name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    args = {}

                log.info("ReAct iter %d: %s(%s)", iteration, tool_name, args)
                result_str = await self.executor.run(tool_name, args, user_id, category=category)
                shopping_messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result_str,
                })
                try:
                    data = json.loads(result_str)
                    if "products" in data:
                        products_collected.extend(data["products"])
                except (json.JSONDecodeError, TypeError):
                    pass

        # Fallback only on actual LLM API error
        if llm_error and not products_collected:
            try:
                fb = await self.executor.run("search_products", {"query": message}, user_id, category=category)
                fb_data = json.loads(fb)
                if "products" in fb_data:
                    products_collected.extend(fb_data["products"])
                    shopping_messages.append({
                        "role": "system",
                        "content": f"[System: search returned {len(fb_data['products'])} results.]"
                    })
            except Exception as exc:
                log.warning("Fallback search failed: %s", exc)

        # Stream final response
        full_response = ""
        try:
            stream = await self._client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=shopping_messages,
                stream=True,
            )
            async for chunk in stream:
                d = chunk.choices[0].delta
                if d.content:
                    full_response += d.content
                    yield {"type": "text", "content": d.content}
        except Exception as exc:
            log.error("Shopping stream failed: %s", exc)
            full_response = (
                f"Found {len(products_collected)} item(s) — check the results panel!"
                if products_collected else
                "Sorry, something went wrong. Could you try again?"
            )
            yield {"type": "text", "content": full_response}

        # Deduplicated product cards
        if products_collected:
            seen: set = set()
            unique = []
            for p in products_collected:
                pid = p.get("id")
                if pid and pid not in seen:
                    seen.add(pid)
                    unique.append(p)
            yield {"type": "products", "products": unique}

        await self.memory.add_message(
            ctx, "assistant", self.guardrails.check_output(full_response)
        )
