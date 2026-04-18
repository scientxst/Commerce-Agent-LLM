import { create } from 'zustand';
import * as api from '../lib/api';

const useCartStore = create((set) => ({
  items: [],
  subtotal: 0,
  tax: 0,
  total: 0,
  itemCount: 0,
  merchants: [],
  isOpen: false,

  toggleCart: () => set((s) => ({ isOpen: !s.isOpen })),
  openCart: () => set({ isOpen: true }),
  closeCart: () => set({ isOpen: false }),

  refreshCart: async () => {
    const data = await api.getCart();
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
    const data = await api.addToCart(productId, quantity, selectedSize, selectedColor);
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
    const data = await api.removeFromCart(productId);
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
    const data = await api.updateCartQuantity(productId, quantity);
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
