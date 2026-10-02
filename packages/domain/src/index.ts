export type ProductStatus = "available" | "coming-soon" | "archived";
export type VerificationStatus = "verified" | "required";

export interface Money {
  amount: number;
  currency: "IDR";
}

export interface ProductSize {
  id: string;
  label: string;
  price?: number;
  available: boolean;
  sku?: string;
}

export interface ProductMedia {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

/**
 * Product facts below are intentionally optional: a missing value means the
 * fact is NOT verified for the commercial SKU yet and must render as an
 * "awaiting verification" state instead of fabricated content (ADR-003).
 */
export interface Product {
  id: string;
  slug: string;
  name: string;
  descriptor: string;
  status: ProductStatus;
  image: string;
  imageAlt: string;
  eyebrow: string;
  story: string;
  sizes: ProductSize[];
  verificationStatus?: VerificationStatus;
  positioning?: string;
  format?: "flour" | "shake" | "ppang" | "mie";
  usageSteps?: string[];
  shortDescriptor?: string;
  longDescription?: string;
  pack?: string;
  ingredients?: string;
  preparation?: string;
  producer?: string;
  nutrition?: string;
  legal?: string;
  shelfLife?: string;
  images?: ProductMedia[];
  videos?: ProductMedia[];
}

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  sizeId: string;
  sizeLabel: string;
  quantity: number;
  unitPrice: number;
  image: string;
}

export interface Cart {
  items: CartItem[];
}

export type OrderStatus = "pending" | "awaiting-payment" | "paid" | "fulfilled" | "cancelled";

export interface Order {
  id: string;
  status: OrderStatus;
  lines: CartItem[];
  subtotal: Money;
  createdAt: string;
}

export type ClaimStatus = "approved" | "pending" | "rejected";

export interface ProductClaim {
  id: string;
  text: string;
  approvalStatus: ClaimStatus;
  publicVisibility: boolean;
  verificationNote?: string;
  scopeType?: "brand" | "product" | "root" | "offering";
  scopeId?: string;
  evidenceReference?: string;
}

export function calculateSubtotal(items: readonly CartItem[]): number {
  return items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
}

export const MAX_CART_LINE_QUANTITY = 20;

export type CartLine = { productId: string; sizeId: string; quantity: number };

function sameLine(line: CartLine, productId: string, sizeId: string) {
  return line.productId === productId && line.sizeId === sizeId;
}

export function upsertCartLine(lines: readonly CartLine[], productId: string, sizeId: string, quantity: number): CartLine[] {
  const safeQuantity = Math.min(Math.max(Math.trunc(quantity) || 0, 0), MAX_CART_LINE_QUANTITY);
  if (safeQuantity === 0) return removeCartLine(lines, productId, sizeId);
  if (!lines.some((line) => sameLine(line, productId, sizeId))) return [...lines, { productId, sizeId, quantity: safeQuantity }];
  return lines.map((line) => sameLine(line, productId, sizeId) ? { ...line, quantity: safeQuantity } : line);
}

export function setCartLineQuantity(lines: readonly CartLine[], productId: string, sizeId: string, quantity: number): CartLine[] {
  return upsertCartLine(lines, productId, sizeId, quantity);
}

export function removeCartLine(lines: readonly CartLine[], productId: string, sizeId: string): CartLine[] {
  return lines.filter((line) => !sameLine(line, productId, sizeId));
}

export * from "./product-discovery.js";
export * from "./channel.js";
export * from "./assistant.js";
export * from "./orders.js";
export * from "./identity.js";
