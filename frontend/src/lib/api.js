const API_URL = '';  // proxy handles it

export async function fetchProducts(category, limit = 20) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  params.set('limit', limit);
  const res = await fetch(`${API_URL}/api/products?${params}`);
  return res.json();
}

export async function fetchProduct(productId) {
  const res = await fetch(`${API_URL}/api/products/${productId}`);
  return res.json();
}

export async function addToCart(userId, productId, quantity = 1, selectedSize, selectedColor) {
  const res = await fetch(`${API_URL}/api/cart/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, product_id: productId, quantity, selected_size: selectedSize, selected_color: selectedColor }),
  });
  return res.json();
}

export async function getCart(userId) {
  const res = await fetch(`${API_URL}/api/cart/${userId}`);
  return res.json();
}

export async function removeFromCart(userId, productId) {
  const res = await fetch(`${API_URL}/api/cart/${userId}/${productId}`, { method: 'DELETE' });
  return res.json();
}

export async function updateCartQuantity(userId, productId, quantity) {
  const res = await fetch(`${API_URL}/api/cart/${userId}/${productId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity }),
  });
  return res.json();
}

export async function createCheckoutSession(userId) {
  const res = await fetch(`${API_URL}/api/checkout/create-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  return res.json();
}

export async function sendChatMessage(userId, sessionId, message) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, session_id: sessionId, message }),
  });
  return res.json();
}
