"""Orchestration engine using real ReAct pattern with OpenAI function calling."""
import json
import logging
from typing import Dict, Any, AsyncIterator

from openai import AsyncOpenAI

from app.core.guardrails import GuardrailsEngine
from app.tools.executor import ToolExecutor
from app.tools.registry import TOOL_DEFINITIONS
from app.services.memory import MemoryService
from app.utils.config import settings

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a shopping assistant for an e-commerce platform with products from multiple merchants.

CRITICAL RULES:
1. ALWAYS use the search_products or browse_category tool when the user asks about any product, category, or shopping need. NEVER answer product questions from memory — you MUST call a tool first.
2. Even for greetings like "hi" or "hello", call search_products with a general query to show some featured products. Every response should ideally include products.
3. Never invent prices, discounts, or promo codes. Use ONLY data returned by tools.
4. Never claim a product is in stock without verifying via tools.
5. When presenting products, always mention the merchant name (who sells it) and price.
6. Only decline completely non-commerce topics (weather, politics, recipes). Shopping-adjacent questions are fine.
7. Be concise, friendly, and helpful. Format responses with brief descriptions, not walls of text.
8. If the user asks to add something to cart, use the add_to_cart tool.

User context:
- Recent products: {recent_products}
- Cart: {cart_info}
- Preferences: {preferences}"""


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

        # --- ReAct loop: let the LLM decide which tools to call ---
        products_collected = []
        tool_was_called = False

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
                # Fall back to a keyword search if the LLM is unreachable
                break

            assistant_msg = resp.choices[0].message

            if not assistant_msg.tool_calls:
                break  # LLM is done reasoning, ready to give final answer

            # Execute each tool call
            messages.append(assistant_msg.model_dump(exclude_none=True))

            for tc in assistant_msg.tool_calls:
                tool_name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    args = {}

                log.info("ReAct iter %d: %s(%s)", iteration, tool_name, args)
                result_str = await self.executor.run(tool_name, args, user_id)
                tool_was_called = True

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result_str,
                })

                # Collect products for frontend cards
                try:
                    result_data = json.loads(result_str)
                    if "products" in result_data:
                        products_collected.extend(result_data["products"])
                except (json.JSONDecodeError, TypeError):
                    pass

        # --- Fallback: if no tools were called, proactively search ---
        # This catches cases where the LLM is down or didn't use tools
        if not tool_was_called and not products_collected:
            log.info("No tools called — running fallback search for: %s", message[:80])
            try:
                fallback_result = await self.executor.run(
                    "search_products", {"query": message}, user_id
                )
                fallback_data = json.loads(fallback_result)
                if "products" in fallback_data:
                    products_collected.extend(fallback_data["products"])
                    # Add the search results to context so the LLM can reference them
                    messages.append({
                        "role": "system",
                        "content": f"[System: automatic product search returned {len(fallback_data['products'])} results. Present these to the user.]"
                    })
                    messages.append({
                        "role": "assistant",
                        "content": f"I found some products for you. Here are the top matches based on your request."
                    })
            except Exception as exc:
                log.warning("Fallback search failed: %s", exc)

        # --- Stream the final response (no tools, just text) ---
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
            # Provide a helpful fallback message
            if products_collected:
                full_response = f"Here are {len(products_collected)} products I found for you. Take a look at the cards below!"
            else:
                full_response = (
                    "I'm having trouble connecting to my AI service right now. "
                    "You can browse products by category using the links above, "
                    "or try again in a moment."
                )
            yield {"type": "text", "content": full_response}

        # --- Send product cards if we found any ---
        if products_collected:
            yield {"type": "products", "products": products_collected}

        # --- Post-process guardrails ---
        full_response = self.guardrails.check_output(full_response)

        # --- Save to memory ---
        await self.memory.add_message(ctx, "assistant", full_response)

        yield {"type": "done"}
