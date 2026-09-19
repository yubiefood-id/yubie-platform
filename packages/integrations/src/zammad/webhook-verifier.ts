import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 256 * 1024;

export interface ZammadWebhookVerifyInput {
  rawBody: Buffer;
  signature: string | null;
  secret: string;
  bearerToken?: string;
  authorizationHeader?: string | null;
}

export type ZammadWebhookVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_signature" | "invalid_signature" | "invalid_bearer" | "body_too_large" };

function normalizeSignature(header: string): string {
  const trimmed = header.trim();
  if (trimmed.startsWith("sha1=")) return trimmed.slice(5);
  return trimmed;
}

export function verifyZammadWebhook(input: ZammadWebhookVerifyInput): ZammadWebhookVerifyResult {
  if (input.rawBody.byteLength > MAX_BODY_BYTES) {
    return { ok: false, reason: "body_too_large" };
  }

  if (input.bearerToken) {
    const auth = input.authorizationHeader ?? "";
    const expected = `Bearer ${input.bearerToken}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(auth);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "invalid_bearer" };
    }
  }

  if (!input.secret) {
    return { ok: true };
  }

  if (!input.signature) {
    return { ok: false, reason: "missing_signature" };
  }

  const expectedHex = createHmac("sha1", input.secret).update(input.rawBody).digest("hex");
  const received = normalizeSignature(input.signature);
  const a = Buffer.from(expectedHex);
  const b = Buffer.from(received);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid_signature" };
  }

  return { ok: true };
}

export function buildZammadDedupeKey(parts: {
  deliveryId?: string | null;
  provider: string;
  ticketId?: string;
  articleId?: string;
  payloadHash: string;
}): string {
  if (parts.deliveryId) return parts.deliveryId;
  return `${parts.provider}:${parts.ticketId ?? "na"}:${parts.articleId ?? "na"}:${parts.payloadHash}`;
}
