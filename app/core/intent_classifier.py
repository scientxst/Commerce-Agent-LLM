import json
import logging
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate

from app.models.schemas import Intent, IntentClassification, ConversationContext
from app.utils.config import settings

log = logging.getLogger(__name__)


class IntentClassifier:
    """Classifies user messages into shopping intents using an LLM call.
    This runs as a lightweight side-channel for analytics/logging —
    the ReAct loop handles actual tool selection independently."""

    def __init__(self):
        self.llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            temperature=0,
            api_key=settings.OPENAI_API_KEY,
        )

        self.prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an intent classifier for an e-commerce assistant.\n"
                "Given the user message and recent conversation, return "
                "a JSON object with these keys:\n"
                "  intent   – one of BROWSE, SEARCH, PURCHASE, SUPPORT, INQUIRY\n"
                "  confidence – float 0-1\n"
                "  entities  – extracted entities (category, brand, price_max, "
                "price_min, product_id, order_id, query, etc.)\n\n"
                "BROWSE  = casual exploration\n"
                "SEARCH  = specific product lookup\n"
                "PURCHASE = ready to buy / add to cart\n"
                "SUPPORT  = order tracking, customer service\n"
                "INQUIRY  = questions about a specific product\n\n"
                "Recent conversation:\n{history}\n\n"
                "Respond ONLY with valid JSON."
            )),
            ("user", "{message}"),
        ])

    async def classify(self, message: str,
                       context: ConversationContext) -> IntentClassification:
        history_lines = [
            f"{m['role']}: {m['content']}" for m in context.messages[-5:]
        ]
        history_str = "\n".join(history_lines) if history_lines else "(none)"

        chain = self.prompt | self.llm
        response = await chain.ainvoke({
            "history": history_str,
            "message": message,
        })

        try:
            raw = response.content.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            result = json.loads(raw)
            return IntentClassification(
                intent=Intent(result["intent"]),
                confidence=float(result.get("confidence", 0.8)),
                entities=result.get("entities", {}),
            )
        except (json.JSONDecodeError, KeyError, ValueError) as exc:
            log.warning("Intent parse failed (%s), defaulting to INQUIRY", exc)
            return IntentClassification(
                intent=Intent.INQUIRY,
                confidence=0.4,
                entities={"query": message},
            )
