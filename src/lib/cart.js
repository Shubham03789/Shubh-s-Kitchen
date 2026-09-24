import { useEffect, useState } from "react";

const STORAGE_KEY = "store.cart";
export const MAX_QUANTITY = 10;

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const cart = {};
    for (const [id, quantity] of Object.entries(saved || {})) {
      if (Number.isInteger(quantity) && quantity >= 1) cart[id] = Math.min(quantity, MAX_QUANTITY);
    }
    return cart;
  } catch {
    return {};
  }
}

function saveCart(cart) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch {
    return;
  }
}

export function useCart() {
  const [cart, setCart] = useState(loadCart);

  useEffect(() => {
    saveCart(cart);
  }, [cart]);

  function setQuantity(productId, quantity) {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[productId];
      else next[productId] = Math.min(quantity, MAX_QUANTITY);
      return next;
    });
  }

  function add(productId) {
    setCart((current) => ({
      ...current,
      [productId]: Math.min((current[productId] || 0) + 1, MAX_QUANTITY),
    }));
  }

  function clear() {
    setCart({});
  }

  const count = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);

  return { cart, count, add, setQuantity, clear };
}
