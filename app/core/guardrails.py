import re
import logging
from typing import Optional

log = logging.getLogger(__name__)

COMPETITOR_BRANDS = {
    "amazon basics", "target brand", "walmart brand",
    "great value", "kirkland", "365 everyday value",
}

PII_PATTERNS = [
    re.compile(r'\b\d{3}-\d{2}-\d{4}\b'),                              # SSN
    re.compile(r'\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b'),           # credit card
    re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'),  # email
]

OFF_TOPIC_KEYWORDS = [
    "recipe", "cooking tips", "weather forecast", "stock market", "investment advice",
    "medical advice", "diagnos", "politic", "religion",
    "tell me a joke", "write a poem", "homework", "math problem",
]


class GuardrailsEngine:
    """Pre-validates user input and post-validates LLM output.
    Unlike the old annotate-only approach, this actually blocks or rewrites
    content when a rule fires."""

    def check_input(self, message: str) -> Optional[str]:
        """Returns a canned response if the message should be blocked,
        or None if it's fine to pass through to the LLM."""

        # scrub any PII from the user message before it ever hits the model
        cleaned = self._strip_pii(message)
        if cleaned != message:
            log.info("PII detected and redacted from user input")
            # we don't block, but we could flag — for now just note it

        lower = message.lower()

        # check for competitor brand queries we shouldn't engage with
        for brand in COMPETITOR_BRANDS:
            if brand in lower:
                log.info("BLOCKED (competitor): %s matched '%s'", message[:60], brand)
                return (
                    "I can only help with products from our own catalog. "
                    "Would you like me to find something similar from our store?"
                )

        # basic off-topic filter
        if any(kw in lower for kw in OFF_TOPIC_KEYWORDS):
            shopping_words = (
                "product", "buy", "price", "cart", "order", "shop", "find",
                "shoe", "shirt", "laptop", "headphone", "watch", "bag",
                "dress", "jacket", "boot", "sneaker", "electronics",
                "recommend", "suggest", "show me", "looking for", "need",
                "cheap", "expensive", "deal", "sale", "brand", "size",
                "color", "compare", "review", "stock", "deliver",
            )
            if not any(shop_word in lower for shop_word in shopping_words):
                matched_kw = [kw for kw in OFF_TOPIC_KEYWORDS if kw in lower]
                log.info("BLOCKED (off-topic): '%s' matched keywords %s", message[:60], matched_kw)
                return (
                    "I'm a shopping assistant, so I'm best at helping you find "
                    "products, manage your cart, and track orders. "
                    "What can I help you shop for?"
                )

        return None  # input is fine

    def check_output(self, response: str) -> str:
        """Scan the LLM response and strip anything that shouldn't be there."""
        response = self._strip_pii(response)
        response = self._strip_competitors(response)
        response = self._strip_fabricated_discounts(response)
        return response

    def scrub_user_message(self, message: str) -> str:
        """Clean PII from the user message before it enters the LLM context."""
        return self._strip_pii(message)

    @staticmethod
    def _strip_pii(text: str) -> str:
        for pattern in PII_PATTERNS:
            text = pattern.sub("[REDACTED]", text)
        return text

    @staticmethod
    def _strip_competitors(text: str) -> str:
        for brand in COMPETITOR_BRANDS:
            text = re.sub(re.escape(brand), "[competitor product]", text, flags=re.IGNORECASE)
        return text

    @staticmethod
    def _strip_fabricated_discounts(text: str) -> str:
        # catch patterns like "50% off" or "use code SAVE20" that the LLM might hallucinate
        fabricated = re.findall(
            r'\b(?:use code|coupon|promo code|discount code)\s+\w+',
            text, re.IGNORECASE
        )
        for match in fabricated:
            text = text.replace(match, "[discount codes are not available at this time]")
        return text
