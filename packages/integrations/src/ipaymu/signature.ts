import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Official sandbox API origin. Production hosts are refused by the adapter. */
export const IPAYMU_SANDBOX_ORIGIN = "https://sandbox.ipaymu.com";

const INTEGER_CALLBACK_KEYS = new Set(["trx_id", "status_code", "transaction_status_code", "paid_off"]);

/**
 * Request signature from https://docs.ipaymu.com/id/docs/signature (fetched 2026-10-19).
 * HMAC covers the SHA-256 of the exact JSON bytes that will be sent, not a re-serialized copy.
 * The API key is the HMAC key. It is never placed in the signature header.
 */
export function signIpaymuRequest(method: string, va: string, exactBody: string, apiKey: string): string {
  const bodyHash = createHash("sha256").update(exactBody).digest("hex");
  const stringToSign = `${method.toUpperCase()}:${va}:${bodyHash}:${apiKey}`;
  return createHmac("sha256", apiKey).update(stringToSign).digest("hex");
}

/**
 * Callback signature from https://docs.ipaymu.com/id/docs/callback.
 * The HMAC key is the merchant VA, which is a different secret from the request API key.
 * Official sample signatures on that page are truncated, so this implements the documented
 * steps and is tested against locally constructed vectors, not a published byte oracle.
 */
export function callbackSigningString(fields: Record<string, unknown>): string {
  const normalized = normalizeCallbackFields(fields);
  const sortedKeys = Object.keys(normalized).sort((left, right) => left.localeCompare(right));
  const sorted: Record<string, unknown> = {};
  for (const key of sortedKeys) sorted[key] = normalized[key];
  return JSON.stringify(sorted).replace(/\//g, "\\/");
}

export function signIpaymuCallback(fields: Record<string, unknown>, va: string): string {
  return createHmac("sha256", va).update(callbackSigningString(fields)).digest("hex");
}

export function verifyIpaymuCallback(fields: Record<string, unknown>, va: string, signature: string): boolean {
  const expected = signIpaymuCallback(fields, va);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function parseIpaymuCallbackBody(raw: string, contentType: string): Record<string, unknown> | null {
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    const fields: Record<string, unknown> = {};
    for (const [key, value] of params.entries()) fields[key] = value;
    return fields;
  }
  return null;
}

export function isSandboxIpaymuHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.host === "sandbox.ipaymu.com";
  } catch {
    return false;
  }
}

function normalizeCallbackFields(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (key === "signature") continue;
    const value = raw[key];
    if (key === "is_escrow") {
      result[key] = value === true || value === "true" || value === "1" || value === 1;
    } else if (INTEGER_CALLBACK_KEYS.has(key)) {
      const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
      result[key] = Number.isFinite(parsed) ? parsed : 0;
    } else if (key === "additional_info") {
      result[key] = value === "[]" || value == null ? [] : value;
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = String(value);
    } else if (value == null) {
      result[key] = "null";
    } else {
      result[key] = value;
    }
  }
  if (!Object.prototype.hasOwnProperty.call(result, "additional_info")) result.additional_info = [];
  return result;
}
