"""Plan generator — kept as a lightweight guidance lookup.

The real planning now happens inside the ReAct orchestrator via OpenAI
function calling. This module provides optional intent-based guidance
hints that the orchestrator can inject into the system prompt.
"""

from app.models.schemas import Intent

INTENT_GUIDANCE = {
    Intent.SEARCH: "Focus on finding products matching the user's criteria. Show relevant results with prices.",
    Intent.BROWSE: "Show a curated selection from the requested category. Highlight variety.",
    Intent.PURCHASE: "Help the user add items to cart. Confirm stock before adding.",
    Intent.SUPPORT: "Look up order status or help with account questions.",
    Intent.INQUIRY: "Answer questions about specific products using verified data only.",
}


def get_guidance_for_intent(intent: Intent) -> str:
    return INTENT_GUIDANCE.get(intent, INTENT_GUIDANCE[Intent.INQUIRY])
