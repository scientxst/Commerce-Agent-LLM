import useAuthStore from '../stores/authStore';

const API_URL = import.meta.env.VITE_BACKEND_URL || '';

function authHeaders(extra = {}) {
  const token = useAuthStore.getState().token;
  return token
    ? { ...extra, Authorization: `Bearer ${token}` }
    : { ...extra };
}

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

export async function addToCart(productId, quantity = 1, selectedSize, selectedColor) {
  const res = await fetch(`${API_URL}/api/cart/add`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ product_id: productId, quantity, selected_size: selectedSize, selected_color: selectedColor }),
  });
  return res.json();
}

export async function getCart() {
  const res = await fetch(`${API_URL}/api/cart/me`, { headers: authHeaders() });
  return res.json();
}

export async function removeFromCart(productId) {
  const res = await fetch(`${API_URL}/api/cart/me/${productId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return res.json();
}

export async function updateCartQuantity(productId, quantity) {
  const res = await fetch(`${API_URL}/api/cart/me/${productId}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ quantity }),
  });
  return res.json();
}

export async function createCheckoutSession(shippingInfo = {}) {
  const res = await fetch(`${API_URL}/api/checkout/create-session`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      shipping_name: shippingInfo.name || '',
      shipping_address: shippingInfo.address || '',
      shipping_city: shippingInfo.city || '',
      shipping_state: shippingInfo.state || '',
      shipping_zip: shippingInfo.zip || '',
    }),
  });
  return res.json();
}

export async function sendChatMessage(sessionId, message) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  return res.json();
}
