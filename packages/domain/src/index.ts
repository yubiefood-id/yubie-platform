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
}

export function calculateSubtotal(items: readonly CartItem[]): number {
  return items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
}
