import { create } from 'zustand';
import * as api from '../lib/api';

const useCartStore = create((set, get) => ({
  items: [],
  subtotal: 0,
  tax: 0,
  total: 0,
  itemCount: 0,
  merchants: [],
  isOpen: false,
  userId: 'user_' + Math.random().toString(36).substr(2, 9),

  toggleCart: () => set((s) => ({ isOpen: !s.isOpen })),
  openCart: () => set({ isOpen: true }),
  closeCart: () => set({ isOpen: false }),

  refreshCart: async () => {
    const data = await api.getCart(get().userId);
    set({
      items: data.items || [],
      subtotal: data.subtotal || 0,
      tax: data.tax || 0,
      total: data.total || 0,
      itemCount: data.item_count || 0,
      merchants: data.merchants || [],
    });
  },

  addItem: async (productId, quantity, selectedSize, selectedColor) => {
    const data = await api.addToCart(get().userId, productId, quantity, selectedSize, selectedColor);
    set({
      items: data.items || [],
      subtotal: data.subtotal || 0,
      tax: data.tax || 0,
      total: data.total || 0,
      itemCount: data.item_count || 0,
      merchants: data.merchants || [],
    });
  },

  removeItem: async (productId) => {
    const data = await api.removeFromCart(get().userId, productId);
    set({
      items: data.items || [],
      subtotal: data.subtotal || 0,
      tax: data.tax || 0,
      total: data.total || 0,
      itemCount: data.item_count || 0,
      merchants: data.merchants || [],
    });
  },

  updateQuantity: async (productId, quantity) => {
    const data = await api.updateCartQuantity(get().userId, productId, quantity);
    set({
      items: data.items || [],
      subtotal: data.subtotal || 0,
      tax: data.tax || 0,
      total: data.total || 0,
      itemCount: data.item_count || 0,
      merchants: data.merchants || [],
    });
  },
}));

export default useCartStore;
