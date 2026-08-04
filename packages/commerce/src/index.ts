import type { CartItem, Money, Order } from "@yubie/domain";

export interface CheckoutInput {
  lines: CartItem[];
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  provider: string;
  status: "preview" | "ready";
  redirectUrl: string | null;
}

export interface CommerceProvider {
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  getOrder(orderId: string): Promise<Order | null>;
  refund(orderId: string, amount?: Money): Promise<{ accepted: boolean }>;
}

export class PreviewCommerceProvider implements CommerceProvider {
  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const signature = input.lines.map((line) => `${line.productId}:${line.sizeId}:${line.quantity}`).join("|");
    return {
      id: `preview-${stableHash(`${input.customerEmail}|${signature}`)}`,
      provider: "preview",
      status: "preview",
      redirectUrl: null,
    };
  }

  async getOrder(): Promise<Order | null> {
    return null;
  }

  async refund(): Promise<{ accepted: boolean }> {
    return { accepted: false };
  }
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
