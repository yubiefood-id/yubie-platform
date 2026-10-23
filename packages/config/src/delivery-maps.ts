import type { RuntimeEnvSource } from "./index.js";
export function parseDeliveryMapsConfig(env: RuntimeEnvSource): { apiKey: string } | null {
  if (!env.MAPS_PROVIDER || env.MAPS_PROVIDER === "disabled") return null;
  if (env.MAPS_PROVIDER !== "google") throw new Error("CONFIG_ERROR: MAPS_PROVIDER is invalid");
  if (!env.DATABASE_URL) throw new Error("CONFIG_ERROR: DATABASE_URL required for Maps admission");
  if (!env.GOOGLE_MAPS_SERVER_KEY || env.GOOGLE_MAPS_SERVER_KEY.length > 256) throw new Error("CONFIG_ERROR: GOOGLE_MAPS_SERVER_KEY required for Maps");
  return { apiKey: env.GOOGLE_MAPS_SERVER_KEY };
}
