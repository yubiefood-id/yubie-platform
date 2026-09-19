import { createHmac, timingSafeEqual } from "node:crypto";

const REPLAY_WINDOW_SEC = 300;
const MAX_BODY_BYTES = 256 * 1024;

export interface WebhookVerifyInput {
  rawBody: Buffer;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  nowSec?: number;
}

export type WebhookVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_signature" | "missing_timestamp" | "stale_timestamp" | "body_too_large" | "invalid_signature" };

export function verifyChatwootWebhook(input: WebhookVerifyInput): WebhookVerifyResult {
  if (input.rawBody.byteLength > MAX_BODY_BYTES) {
    return { ok: false, reason: "body_too_large" };
  }
  if (!input.signature) {
    return { ok: false, reason: "missing_signature" };
  }
  if (!input.timestamp) {
    return { ok: false, reason: "missing_timestamp" };
  }
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  const ts = Number.parseInt(input.timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > REPLAY_WINDOW_SEC) {
    return { ok: false, reason: "stale_timestamp" };
  }
  const expected = `sha256=${createHmac("sha256", input.secret).update(`${input.timestamp}.${input.rawBody.toString("utf8")}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true };
}

export function hashPayload(rawBody: Buffer): string {
  return createHmac("sha256", "yubie-inbox").update(rawBody).digest("hex");
}
