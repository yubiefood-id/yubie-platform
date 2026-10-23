import type { RuntimeEnvSource } from "./index.js";
export interface IdentityRuntimeConfig {
  hashSecret: string; encryptionKey: string; allowedCountries: string[]; appOrigin: string;
  turnstileSecretKey: string;
  smsgate: { baseUrl: string; username: string; password: string; deviceId: string; simNumber: number };
}
/** Service-specific secret validation; disabled never selects a fake provider. */
export function parseIdentityRuntimeConfig(env: RuntimeEnvSource, scope: "api" | "worker"): IdentityRuntimeConfig | null {
  if (!env.OTP_PROVIDER || env.OTP_PROVIDER === "disabled") return null;
  const invalid = (name: string): never => { throw new Error("CONFIG_ERROR: " + name + " is required or invalid for phone verification"); };
  if (env.OTP_PROVIDER !== "smsgate") invalid("OTP_PROVIDER");
  if (!env.DATABASE_URL) invalid("DATABASE_URL");
  const hashSecret = env.OTP_HASH_SECRET ?? "", encryptionKey = env.OTP_DELIVERY_ENCRYPTION_KEY ?? "";
  if (hashSecret.length < 32) invalid("OTP_HASH_SECRET");
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encryptionKey)) invalid("OTP_DELIVERY_ENCRYPTION_KEY");
  let origin: URL;
  try { origin = new URL(env.APP_ORIGIN ?? ""); } catch { return invalid("APP_ORIGIN"); }
  if (origin.username || origin.password || origin.search || origin.hash || (origin.protocol !== "https:" && env.YUBIE_ENV !== "test")) invalid("APP_ORIGIN");
  const countries = [...new Set((env.OTP_ALLOWED_COUNTRIES ?? "ID").split(",").map(c => c.trim()))];
  if (!countries.length || countries.some(c => !/^[A-Z]{2}$/.test(c))) invalid("OTP_ALLOWED_COUNTRIES");
  if (scope === "api" && !env.TURNSTILE_SECRET_KEY) invalid("TURNSTILE_SECRET_KEY");
  const smsgate = { baseUrl: env.SMSGATE_BASE_URL ?? "", username: env.SMSGATE_USERNAME ?? "", password: env.SMSGATE_PASSWORD ?? "", deviceId: env.SMSGATE_DEVICE_ID ?? "", simNumber: Number(env.SMSGATE_SIM_NUMBER ?? 1) };
  if (scope === "worker") {
    let url: URL; try { url = new URL(smsgate.baseUrl); } catch { return invalid("SMSGATE_BASE_URL"); }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !["/", "/3rdparty/v1"].includes(url.pathname)) invalid("SMSGATE_BASE_URL");
    if (!smsgate.username || !smsgate.password || !/^[A-Za-z0-9_-]{1,96}$/.test(smsgate.deviceId) || !Number.isInteger(smsgate.simNumber) || smsgate.simNumber < 1 || smsgate.simNumber > 4) invalid("SMSGATE credentials/device/SIM");
  }
  return { hashSecret, encryptionKey, allowedCountries: countries, appOrigin: origin.origin, turnstileSecretKey: env.TURNSTILE_SECRET_KEY ?? "", smsgate };
}
