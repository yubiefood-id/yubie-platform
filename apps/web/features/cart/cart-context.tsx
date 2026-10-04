"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import {
  MAX_CART_LINE_QUANTITY,
  productFamilies,
  removeCartLine,
  setCartLineQuantity,
  upsertCartLine,
  type CartLine,
  type Product,
  type ProductSize,
} from "@yubie/domain";
import { trackEvent } from "@/lib/analytics";

const STORAGE_KEY = "yubie.cart.v1";
const PROMO_STORAGE_KEY = "yubie.promo.v1";

interface CartState {
  lines: CartLine[];
  hydrated: boolean;
  open: boolean;
  promoCode: string | null;
}

type CartAction =
  | { type: "hydrate"; lines: CartLine[] }
  | { type: "add"; productId: string; sizeId: string; quantity: number }
  | { type: "setQuantity"; productId: string; sizeId: string; quantity: number }
  | { type: "remove"; productId: string; sizeId: string }
  | { type: "clear" }
  | { type: "open" }
  | { type: "close" }
  | { type: "applyPromo"; code: string }
  | { type: "clearPromo" };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "hydrate":
      return { ...state, lines: action.lines, hydrated: true };
    case "add":
      return { ...state, lines: upsertCartLine(state.lines, action.productId, action.sizeId, action.quantity) };
    case "setQuantity":
      return { ...state, lines: setCartLineQuantity(state.lines, action.productId, action.sizeId, action.quantity) };
    case "remove":
      return { ...state, lines: removeCartLine(state.lines, action.productId, action.sizeId) };
    case "clear":
      return { ...state, lines: [] };
    case "open":
      return { ...state, open: true };
    case "close":
      return { ...state, open: false };
    case "applyPromo":
      return { ...state, promoCode: action.code.trim().toUpperCase() };
    case "clearPromo":
      return { ...state, promoCode: null };
  }
}

export interface CartDisplayLine {
  line: CartLine;
  product: Product;
  size: ProductSize;
  lineTotal: number;
}

interface CartContextValue {
  lines: CartLine[];
  hydrated: boolean;
  isOpen: boolean;
  count: number;
  addItem: (productId: string, sizeId: string, quantity: number) => void;
  setQuantity: (productId: string, sizeId: string, quantity: number) => void;
  removeItem: (productId: string, sizeId: string) => void;
  clear: () => void;
  openCart: () => void;
  closeCart: () => void;
  promoCode: string | null;
  applyPromo: (code: string) => void;
  clearPromo: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function isStoredLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return typeof line.productId === "string" && typeof line.sizeId === "string" && typeof line.quantity === "number" && line.quantity >= 1;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { lines: [], hydrated: false, open: false, promoCode: null });

  useEffect(() => {
    let lines: CartLine[] = [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) lines = parsed.filter(isStoredLine);
    } catch {
      lines = [];
    }
    dispatch({ type: "hydrate", lines });
    try {
      const promoCode = window.localStorage.getItem(PROMO_STORAGE_KEY);
      if (promoCode) dispatch({ type: "applyPromo", code: promoCode });
    } catch {
      // Storage unavailable: promotion remains session-only.
    }
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.lines));
    } catch {
      // Storage unavailable (private mode): cart stays in-memory only.
    }
  }, [state.lines, state.hydrated]);

  useEffect(() => {
    if (!state.hydrated) return;
    try {
      if (state.promoCode) window.localStorage.setItem(PROMO_STORAGE_KEY, state.promoCode);
      else window.localStorage.removeItem(PROMO_STORAGE_KEY);
    } catch {
      // Storage unavailable: promotion remains session-only.
    }
  }, [state.promoCode, state.hydrated]);

  useEffect(() => {
    document.body.style.overflow = state.open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [state.open]);

  const addItem = useCallback((productId: string, sizeId: string, quantity: number) => {
    dispatch({ type: "add", productId, sizeId, quantity });
    dispatch({ type: "open" });
    const size = productFamilies.find((product) => product.id === productId)?.sizes.find((item) => item.id === sizeId);
    trackEvent("add_to_cart", {
      product_id: productId,
      size_id: sizeId,
      quantity,
      ...(typeof size?.price === "number" ? { value: size.price * quantity } : {}),
    });
  }, []);

  const value = useMemo<CartContextValue>(() => ({
    lines: state.lines,
    hydrated: state.hydrated,
    isOpen: state.open,
    count: state.lines.reduce((total, line) => total + line.quantity, 0),
    addItem,
    setQuantity: (productId, sizeId, quantity) => dispatch({ type: "setQuantity", productId, sizeId, quantity }),
    removeItem: (productId, sizeId) => dispatch({ type: "remove", productId, sizeId }),
    clear: () => dispatch({ type: "clear" }),
    openCart: () => dispatch({ type: "open" }),
    closeCart: () => dispatch({ type: "close" }),
    promoCode: state.promoCode,
    applyPromo: (code) => dispatch({ type: "applyPromo", code }),
    clearPromo: () => dispatch({ type: "clearPromo" }),
  }), [state, addItem]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}

/**
 * Enriches stored id-only lines against the current domain catalog on every
 * render. Prices and display names are always resolved from the catalog —
 * persisted cart data is never treated as a source of money.
 */
export function useCartDisplayLines(): CartDisplayLine[] {
  const { lines } = useCart();
  return useMemo(() => lines.flatMap((line) => {
    const product = productFamilies.find((item) => item.id === line.productId);
    const size = product?.sizes.find((item) => item.id === line.sizeId);
    if (!product || !size || typeof size.price !== "number") return [];
    return [{ line, product, size, lineTotal: size.price * line.quantity }];
  }), [lines]);
}

export { MAX_CART_LINE_QUANTITY };
