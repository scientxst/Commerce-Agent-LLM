"""
Test suite for the AI Shopping Assistant.

Two modes:
  1. Unit tests (no server needed):  python test_system.py --unit
  2. HTTP tests (server must be up):  python test_system.py
"""
import sys
import os
import json
import asyncio

# ── path setup so 'backend/' imports work ──
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))


# ═══════════════════════════════ UNIT TESTS ═══════════════════════════════

def test_product_db():
    from app.services.product_db import ProductDBService
    db = ProductDBService()
    products = db.get_all_products()
    assert len(products) >= 40, f"Expected 40+ products, got {len(products)}"
    # Verify merchant fields present
    for p in products[:5]:
        assert p.merchant_id, f"Missing merchant_id on {p.id}"
        assert p.merchant_name, f"Missing merchant_name on {p.id}"
    print(f"  product_db: {len(products)} products loaded, merchant fields OK")


async def test_keyword_search():
    from app.services.product_db import ProductDBService
    db = ProductDBService()
    results = await db.search(query="running shoes")
    assert len(results) > 0, "Search should return results"
    print(f"  keyword_search: {len(results)} results for 'running shoes'")


async def test_keyword_search_filters():
    from app.services.product_db import ProductDBService
    db = ProductDBService()
    results = await db.search(query="", filters={"category": "Electronics"})
    assert len(results) > 0, "Electronics filter should return results"
    for r in results:
        cat = r["category"] if isinstance(r, dict) else r.category
        assert "electronics" in cat.lower(), f"Wrong category: {cat}"
    print(f"  keyword_search_filters: {len(results)} electronics products")


def test_guardrails_input_blocking():
    from app.core.guardrails import GuardrailsEngine
    g = GuardrailsEngine()
    result = g.check_input("Show me running shoes under $100")
    assert result is None, "Normal shopping query should pass (None = OK)"
    result2 = g.check_input("What's the weather forecast in Paris?")
    assert result2 is not None, "Off-topic query should be blocked"
    print(f"  guardrails_input: pass={result is None}, block_offtopic={result2 is not None}")


def test_guardrails_output_scrub():
    from app.core.guardrails import GuardrailsEngine
    g = GuardrailsEngine()
    dirty = "Great deal! Use promo code SAVE50 for extra savings. Email john@example.com"
    clean = g.check_output(dirty)
    assert "SAVE50" not in clean, "Promo code should be scrubbed"
    assert "john@example.com" not in clean, "Email should be scrubbed"
    print(f"  guardrails_output: promo and PII scrubbed")


def test_guardrails_off_topic():
    from app.core.guardrails import GuardrailsEngine
    g = GuardrailsEngine()
    result = g.check_input("Tell me a joke about cats")
    assert result is not None, f"Off-topic should be blocked, got None"
    result2 = g.check_input("I need a laptop for work")
    assert result2 is None, "Shopping intent should pass"
    print(f"  guardrails_offtopic: joke blocked, laptop passed")


async def test_memory():
    from app.services.user_db import UserDBService
    from app.services.memory import MemoryService
    user_db = UserDBService()
    mem = MemoryService(user_db=user_db)
    ctx = await mem.get_context("u_test_mem", "s_test_mem")
    await mem.add_message(ctx, "user", "I want running shoes")
    await mem.add_message(ctx, "assistant", "Here are some running shoes.")
    ctx2 = await mem.get_context("u_test_mem", "s_test_mem")
    assert len(ctx2.messages) == 2, f"Expected 2 messages, got {len(ctx2.messages)}"
    print(f"  memory: {len(ctx2.messages)} messages stored and persisted")


async def test_user_db_cart():
    from app.services.user_db import UserDBService
    from app.models.schemas import CartItem
    db = UserDBService()
    await db.add_to_cart("test_cart_user", CartItem(product_id="prod_001", quantity=2))
    cart = await db.get_cart("test_cart_user")
    assert len(cart) >= 1, "Cart should have items"
    assert cart[0].quantity == 2
    # Test remove
    await db.remove_from_cart("test_cart_user", "prod_001")
    cart2 = await db.get_cart("test_cart_user")
    assert len(cart2) == 0, "Cart should be empty after remove"
    print(f"  user_db_cart: add/remove works")


def test_tool_registry():
    from app.tools.registry import TOOL_DEFINITIONS
    assert len(TOOL_DEFINITIONS) >= 5, (
        f"Expected 5+ tool definitions, got {len(TOOL_DEFINITIONS)}"
    )
    names = {t["function"]["name"] for t in TOOL_DEFINITIONS}
    for required in ("search_products", "add_to_cart", "get_cart",
                     "get_product_details", "browse_category"):
        assert required in names, f"Missing tool: {required}"

    for tool in TOOL_DEFINITIONS:
        assert tool["type"] == "function"
        fn = tool["function"]
        assert "name" in fn and "description" in fn and "parameters" in fn
        assert fn["parameters"].get("type") == "object"

    print(f"  tool_registry: {len(TOOL_DEFINITIONS)} tools, all valid schema")


async def test_executor_search():
    from app.services.product_db import ProductDBService
    from app.services.user_db import UserDBService
    from app.services.vector_db import VectorDBService
    from app.tools.executor import ToolExecutor

    pdb = ProductDBService()
    udb = UserDBService()
    vdb = VectorDBService()
    products = pdb.get_all_products()
    await vdb.build_index([p.dict() for p in products])

    executor = ToolExecutor(vdb, pdb, udb)
    result = json.loads(await executor.run("search_products", {"query": "laptop"}, "test"))
    assert "products" in result
    assert result["count"] > 0
    print(f"  executor_search: {result['count']} results for 'laptop'")


async def test_cart_summary_with_tax():
    from app.services.product_db import ProductDBService
    from app.services.user_db import UserDBService
    from app.services.vector_db import VectorDBService
    from app.tools.executor import ToolExecutor
    from app.models.schemas import CartItem

    pdb = ProductDBService()
    udb = UserDBService()
    vdb = VectorDBService()
    await vdb.build_index([p.dict() for p in pdb.get_all_products()])

    executor = ToolExecutor(vdb, pdb, udb)

    # Add items from different merchants
    await udb.add_to_cart("tax_test", CartItem(product_id="prod_001", quantity=1))  # Sole Comfort
    await udb.add_to_cart("tax_test", CartItem(product_id="prod_010", quantity=1))  # ActiveWear

    summary = await executor.get_cart_summary("tax_test")
    assert summary.item_count == 2
    assert summary.tax > 0, "Tax should be calculated"
    assert len(summary.merchants) == 2, f"Expected 2 merchants, got {summary.merchants}"
    assert abs(summary.total - (summary.subtotal + summary.tax)) < 0.01
    print(f"  cart_summary: {summary.item_count} items, ${summary.total}, merchants={summary.merchants}")


def run_unit_tests():
    print("Running unit tests\n")

    test_product_db()
    asyncio.run(test_keyword_search())
    asyncio.run(test_keyword_search_filters())

    test_guardrails_input_blocking()
    test_guardrails_output_scrub()
    test_guardrails_off_topic()

    asyncio.run(test_memory())
    asyncio.run(test_user_db_cart())

    test_tool_registry()

    asyncio.run(test_executor_search())
    asyncio.run(test_cart_summary_with_tax())

    print("\n✅ All unit tests passed.")


# ═══════════════════════════ HTTP TESTS (server) ═══════════════════════════

def test_health():
    """Test if the server is running."""
    import requests
    try:
        response = requests.get("http://localhost:8000/health")
        print("✅ Server Health Check:")
        print(json.dumps(response.json(), indent=2))
        return True
    except Exception as e:
        print(f"❌ Server not responding: {e}")
        return False


def test_products():
    """Test product listing."""
    import requests
    try:
        response = requests.get("http://localhost:8000/api/products?limit=3")
        products = response.json()
        print(f"\n✅ Products API: Found {len(products)} products")
        if products:
            print(f"   Example: {products[0]['name']} by {products[0].get('merchant_name', '?')}")
        return True
    except Exception as e:
        print(f"❌ Products API failed: {e}")
        return False


def test_merchants():
    """Test merchants listing."""
    import requests
    try:
        response = requests.get("http://localhost:8000/api/merchants")
        merchants = response.json()
        print(f"\n✅ Merchants API: {len(merchants)} merchants")
        for m in merchants:
            print(f"   - {m['name']}")
        return True
    except Exception as e:
        print(f"❌ Merchants API failed: {e}")
        return False


def test_cart_api():
    """Test cart add/get/remove via REST."""
    import requests
    try:
        # Add
        r = requests.post("http://localhost:8000/api/cart/add", json={
            "user_id": "http_test", "product_id": "prod_001", "quantity": 1
        })
        data = r.json()
        assert data["item_count"] == 1
        print(f"\n✅ Cart Add: {data['item_count']} item, total=${data['total']}")

        # Get
        r2 = requests.get("http://localhost:8000/api/cart/http_test")
        data2 = r2.json()
        assert data2["item_count"] == 1
        print(f"✅ Cart Get: {data2['item_count']} item, merchants={data2['merchants']}")

        # Remove
        r3 = requests.delete("http://localhost:8000/api/cart/http_test/prod_001")
        data3 = r3.json()
        assert data3["item_count"] == 0
        print(f"✅ Cart Remove: cart empty")

        return True
    except Exception as e:
        print(f"❌ Cart API failed: {e}")
        return False


def test_chat():
    """Test chat endpoint."""
    import requests
    try:
        response = requests.post(
            "http://localhost:8000/api/chat",
            json={
                "user_id": "test_user",
                "session_id": "test_session",
                "message": "Hi, I'm looking for shoes"
            },
            timeout=30,
        )
        data = response.json()
        print(f"\n✅ Chat API: Response received")
        print(f"   Message: {data['message'][:100]}...")
        if data.get('product_cards'):
            print(f"   Products returned: {len(data['product_cards'])}")
        return True
    except Exception as e:
        print(f"❌ Chat API failed: {e}")
        return False


def run_http_tests():
    print("🧪 Testing AI Shopping Assistant (HTTP)\n")
    print("=" * 50)

    results = []
    results.append(test_health())
    results.append(test_products())
    results.append(test_merchants())
    results.append(test_cart_api())
    results.append(test_chat())

    print("\n" + "=" * 50)
    if all(results):
        print("✅ All HTTP tests passed! System is working correctly.")
        print("\nNext steps:")
        print("1. Open http://localhost:3000 in your browser")
        print("2. Start chatting with the AI assistant")
        print("3. Try: 'I need comfortable shoes for a wedding under $150'")
    else:
        print("❌ Some tests failed. Please check:")
        print("1. Is the backend server running? (python -m uvicorn app.main:app --app-dir backend)")
        print("2. Is your OpenAI API key set in .env?")


if __name__ == "__main__":
    if "--unit" in sys.argv:
        run_unit_tests()
    else:
        run_http_tests()
